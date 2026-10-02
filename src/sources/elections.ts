import { unzipSync } from "fflate";
import proj4 from "proj4";
import * as shapefile from "shapefile";
import { packageShow } from "../lib/ckan.js";
import { diskCached, DAY } from "../lib/cache.js";
import { containsPoint, geometryBBox, type GeoFeature, type LonLat } from "../lib/geo.js";
import { cite, type Citation } from "../lib/sources.js";
import { config } from "../config.js";
import { getLayer } from "../lib/wfs.js";

/**
 * Official election results of the Munich election office (Wahlamt, open data
 * dl-de/by-2.0): city-wide, per district (Stadtbezirk, all votes incl. postal)
 * and per polling precinct (Stimmbezirk, in-person votes only), plus the
 * precinct boundaries so an address can be matched to its precinct.
 */

export interface ElectionDef {
  id: string;
  label: string;
  date: string;
  zip: string;
  districts: string;
  precincts?: string;
  constituencies?: string;
  /** CKAN resource name of the precinct shapes for this election. */
  precinctShapes?: { dataset: string; resource: RegExp };
  /** Shapes of the federal constituencies (Wahlkreise), for first-vote results. */
  constituencyShapes?: { dataset: string; resource: RegExp };
  notes: string;
}

export const ELECTIONS: ElectionDef[] = [
  {
    id: "stadtrat_2026",
    label: "City council election 2026 (Stadtratswahl)",
    date: "2026-03-08",
    zip: "https://www.wahlen-muenchen.de/ergebnisse/20260308oberbuergermeisterwahl/endergebnis_stadtratswahl.zip",
    districts: "srw.stadtbezirke.stimmen.csv",
    precincts: "srw.stimmbezirke.stimmen.csv",
    precinctShapes: { dataset: "wahlen-stimm-und-briefwahlbezirke-in-muenchen", resource: /Kommunalwahlen 2026: Stimmbezirke/i },
    notes: "Each voter had 80 votes (cumulating and splitting allowed), so vote counts are votes, not voters; shares decide the 80 seats.",
  },
  {
    id: "ob_2026",
    label: "Mayoral election 2026, first round (Oberbürgermeisterwahl)",
    date: "2026-03-08",
    zip: "https://www.wahlen-muenchen.de/ergebnisse/20260308oberbuergermeisterwahl/endergebnisse_obwahl.zip",
    districts: "obw.stadtbezirke.stimmen.csv",
    precincts: "obw.stimmbezirke.stimmen.csv",
    precinctShapes: { dataset: "wahlen-stimm-und-briefwahlbezirke-in-muenchen", resource: /Kommunalwahlen 2026: Stimmbezirke/i },
    notes:
      "Results are listed by the nominating party of each candidate. No candidate passed 50 %, so a runoff was held on 22 March 2026; its results are published at " +
      "https://www.wahlen-muenchen.de/ergebnisse/20260322oberbuergermeisterwahl/ but not (yet) as open data, so they are not included here.",
  },
  {
    id: "bundestag_2025",
    label: "Federal election 2025, second votes (Bundestagswahl, Zweitstimmen)",
    date: "2025-02-23",
    zip: "https://www.wahlen-muenchen.de/ergebnisse/20250223bundestagswahl/BTW25_Endergebnis_Muenchen.zip",
    districts: "btw.stadtbezirke.zweitstimmen.csv",
    constituencies: "btw.wahlkreise.erststimmen.csv",
    constituencyShapes: { dataset: "wahlen-stimm-und-briefwahlbezirke-in-muenchen", resource: /Bundestagswahl 2025: Wahlkreise/i },
    notes: "Second votes (Zweitstimmen) decide the party shares. Constituency first votes (Erststimmen) are listed separately; under the 2023 electoral law the constituency leader does not automatically get a seat.",
  },
];

export interface PartyResult {
  party: string;
  votes: number | null;
  pct: number | null;
}

export interface AreaResult {
  area: string;
  code: string;
  kind: "city" | "district" | "precinct" | "constituency";
  eligible: number | null;
  voters: number | null;
  turnout_pct: number | null;
  postal_voters?: number | null;
  invalid: number | null;
  parties: PartyResult[];
}

const num = (s?: string) => {
  if (s === undefined || s === "" || s === "-") return null;
  const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/\s*%$/, ""));
  return Number.isFinite(n) ? n : null;
};

/** Parse the Wahlamt CSV layout: 10 fixed columns, then repeating (Partei; Anzahl Stimmen; Prozentzahl). */
export function parseResults(text: string): { code: string; type: string; row: AreaResult }[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((l) => {
    const c = l.split(";");
    const parties: PartyResult[] = [];
    for (let i = 10; i + 2 < c.length + 1; i += 3) {
      if (!c[i]) continue;
      parties.push({ party: c[i].trim(), votes: num(c[i + 1]), pct: num(c[i + 2]) });
    }
    parties.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    const eligible = num(c[3]);
    const voters = num(c[7]);
    return {
      code: c[1],
      type: c[2],
      row: {
        area: c[1],
        code: c[1],
        kind: "district" as const,
        eligible,
        voters,
        turnout_pct: eligible && voters ? Math.round((voters / eligible) * 1000) / 10 : null,
        postal_voters: num(c[8]),
        invalid: num(c[9]),
        parties,
      },
    };
  });
}

interface LoadedElection {
  def: ElectionDef;
  city: AreaResult;
  districts: Map<string, AreaResult>;
  precincts: Map<string, AreaResult>;
  constituencies: Map<string, AreaResult>;
  fetchedAt: number;
}

const loaded = new Map<string, LoadedElection>();

async function fetchZip(url: string): Promise<Record<string, Uint8Array>> {
  const res = await fetch(url, { headers: { "User-Agent": config.userAgent }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return unzipSync(new Uint8Array(await res.arrayBuffer()));
}

const decode = (b?: Uint8Array) => (b ? new TextDecoder("utf-8").decode(b) : "");

export async function loadElection(id: string): Promise<LoadedElection> {
  const def = ELECTIONS.find((e) => e.id === id);
  if (!def) throw new Error(`Unknown election "${id}". Available: ${ELECTIONS.map((e) => e.id).join(", ")}`);
  const cur = loaded.get(id);
  if (cur) return cur;
  // Final results do not change: cache for a long time.
  const { value, fetchedAt } = await diskCached(`election_${id}`, 365 * DAY, async () => {
    const files = await fetchZip(def.zip);
    const pick = (name?: string) => (name ? decode(files[Object.keys(files).find((k) => k.endsWith(name)) ?? ""]) : "");
    return { districts: pick(def.districts), precincts: pick(def.precincts), constituencies: pick(def.constituencies) };
  });
  const districtRows = parseResults(value.districts);
  // Type 1 = all votes (in-person + postal), 11 = in-person, 21 = postal.
  const total = (rows: ReturnType<typeof parseResults>) => rows.filter((r) => r.type === "1" || r.type === "01");
  const cityRow = total(districtRows).find((r) => r.code.startsWith("162"))?.row ?? districtRows.find((r) => r.code.startsWith("162"))!.row;
  const districts = new Map<string, AreaResult>();
  for (const r of total(districtRows)) {
    if (r.code.startsWith("162")) continue;
    const code = r.code.padStart(2, "0");
    districts.set(code, { ...r.row, code, area: code, kind: "district" });
  }
  const precincts = new Map<string, AreaResult>();
  for (const r of value.precincts ? parseResults(value.precincts) : []) {
    if (r.type !== "11" || r.code.startsWith("162")) continue;
    precincts.set(r.code, { ...r.row, kind: "precinct" });
  }
  const constituencies = new Map<string, AreaResult>();
  for (const r of value.constituencies ? parseResults(value.constituencies) : []) {
    if ((r.type !== "1" && r.type !== "01") || r.code.startsWith("162")) continue;
    constituencies.set(r.code, { ...r.row, kind: "constituency" });
  }
  const le: LoadedElection = { def, city: { ...cityRow, area: "München", code: "162", kind: "city" }, districts, precincts, constituencies, fetchedAt };
  loaded.set(id, le);
  return le;
}

// --------------------------------------------------------- precinct shapes

proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
const toWgs = proj4("EPSG:25832", "EPSG:4326");

function reproject(coords: any): any {
  return typeof coords[0] === "number" ? toWgs.forward([coords[0], coords[1]]).map((v: number) => Math.round(v * 1e6) / 1e6) : coords.map(reproject);
}

const shapes = new Map<string, GeoFeature[]>();

async function precinctShapes(def: ElectionDef, which: "precinctShapes" | "constituencyShapes" = "precinctShapes"): Promise<GeoFeature[]> {
  const spec = def[which];
  if (!spec) return [];
  const key = `${spec.dataset}:${spec.resource.source}`;
  const cur = shapes.get(key);
  if (cur) return cur;
  const { value } = await diskCached(`shapes_${spec.resource.source.replace(/\W+/g, "_")}`, 365 * DAY, async () => {
    const pkg = await packageShow(spec.dataset);
    const res = pkg.resources.find((r) => spec.resource.test(r.name ?? ""));
    if (!res) throw new Error("precinct shape resource not found");
    const files = await fetchZip(res.url);
    const shp = Object.keys(files).find((k) => k.toLowerCase().endsWith(".shp"))!;
    const dbf = Object.keys(files).find((k) => k.toLowerCase().endsWith(".dbf"))!;
    const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
    const fc = await shapefile.read(ab(files[shp]), ab(files[dbf]), { encoding: "utf-8" });
    return fc.features.map((f: any) => ({
      type: "Feature" as const,
      properties: { precinct: String(f.properties.BEZEICHNUN ?? f.properties.bezeichnun ?? "") },
      geometry: { type: f.geometry.type, coordinates: reproject(f.geometry.coordinates) },
    }));
  });
  const feats = value.map((f) => ({ ...f, bbox: geometryBBox(f.geometry) }));
  shapes.set(key, feats);
  return feats;
}

export async function districtAt(at: LonLat): Promise<{ code: string; name: string } | undefined> {
  const layer = await getLayer("gsm_wfs:vablock_stadtbezirk");
  const f = layer.features.find((x) => containsPoint(x, at));
  return f ? { code: String(f.properties.sb_nummer).padStart(2, "0"), name: String(f.properties.sb_name) } : undefined;
}

export async function precinctAt(def: ElectionDef, at: LonLat, which: "precinctShapes" | "constituencyShapes" = "precinctShapes"): Promise<{ precinct: string; geometry: GeoFeature["geometry"] } | undefined> {
  const feats = await precinctShapes(def, which);
  const f = feats.find((x) => containsPoint(x, at));
  return f ? { precinct: String(f.properties.precinct), geometry: f.geometry } : undefined;
}

export const DISTRICT_NAMES: Record<string, string> = {};

export async function districtNames(): Promise<Record<string, string>> {
  if (Object.keys(DISTRICT_NAMES).length) return DISTRICT_NAMES;
  const layer = await getLayer("gsm_wfs:vablock_stadtbezirk");
  for (const f of layer.features) DISTRICT_NAMES[String(f.properties.sb_nummer).padStart(2, "0")] = String(f.properties.sb_name);
  return DISTRICT_NAMES;
}

export function electionCitation(fetchedAt: number): Citation {
  return cite("elections", fetchedAt);
}

/** Warm caches (results + shapes) so the first question is fast. */
export async function warmElections(): Promise<void> {
  for (const e of ELECTIONS) {
    await loadElection(e.id);
    await precinctShapes(e).catch(() => undefined);
    await precinctShapes(e, "constituencyShapes").catch(() => undefined);
  }
  await districtNames();
}


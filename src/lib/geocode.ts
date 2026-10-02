import { MUNICH_CENTER } from "../config.js";
import { liveCache, DAY } from "./cache.js";
import { withinMunich, type LonLat } from "./geo.js";
import { fetchJson } from "./http.js";
import { cite, type Citation } from "./sources.js";
import { fold } from "./text.js";

/**
 * Geocoding for Munich addresses.
 * Primary: the City of Munich's own GeoPortal address index (all ~162k official
 * addresses, rebuilt daily). Fallback: Photon (OSM), which the GeoPortal also uses.
 */

const ES_URL = "https://geoportal.muenchen.de/search/p1_adressen_4326/_search";

export interface GeocodeHit extends LonLat {
  label: string;
  kind: "address" | "street" | "place";
  precision: "exact" | "nearest-house-number" | "street" | "place";
  source: "city-address-index" | "photon";
}

export interface ResolvedLocation extends LonLat {
  label: string;
  precision: GeocodeHit["precision"] | "coordinates";
  source: GeocodeHit["source"] | "input";
  citation?: Citation;
  warning?: string;
}

interface EsHit {
  _score: number;
  _source: {
    geometry: { type: string; coordinates: [number, number] };
    properties: { type: string; address?: string; strasse?: string; hausnr?: string; nr?: number; zusatz?: string; searchfield?: string };
  };
}

async function es(query: object): Promise<EsHit[]> {
  const url = `${ES_URL}?source=${encodeURIComponent(JSON.stringify(query))}&source_content_type=application/json`;
  const res = await fetchJson<{ hits: { hits: EsHit[] } }>(url, { timeoutMs: 8000 });
  return res.hits?.hits ?? [];
}

export interface ParsedAddress {
  street: string;
  number?: number;
  suffix?: string;
}

/** Split "Lindwurmstr. 50a, 80337 München" into street / number / suffix. */
export function parseAddress(input: string): ParsedAddress {
  let s = input
    .replace(/\b\d{5}\b/g, " ")
    .replace(/\b(m(ü|ue|u)nchen|munich|germany|deutschland|bayern|bavaria)\b/gi, " ")
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = /^(.*?\D)\s*(\d{1,4})\s*([a-zA-Z])?(?:\s*[-/–]\s*\d{1,4}\s*[a-zA-Z]?)?\s*$/.exec(s);
  if (!m) return { street: s };
  s = m[1].trim();
  return { street: s, number: Number(m[2]), suffix: m[3]?.toLowerCase() };
}

/** Normalise the street part for a phrase-prefix query on the city index. */
export function streetPrefix(street: string): string {
  return street
    .replace(/(stra(ß|ss)e|str\.?)$/i, "str")
    .replace(/(stra(ß|ss)e|str\.)\s/gi, "str ")
    .replace(/\bpl\.$/i, "pl")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toHit(h: EsHit, precision: GeocodeHit["precision"]): GeocodeHit {
  const p = h._source.properties;
  const [lon, lat] = h._source.geometry.coordinates;
  return {
    lon,
    lat,
    label: `${(p.address ?? p.searchfield ?? "").replace(/\s+/g, " ").trim()}, München`,
    kind: p.type === "Street" ? "street" : "address",
    precision,
    source: "city-address-index",
  };
}

/** Comparable street key: "Lindwurmstr." / "Lindwurmstraße" -> "lindwurmstr". */
export function streetKey(s: string): string {
  return fold(s)
    .replace(/strasse|str\b\.?/g, "str")
    .replace(/platz\b|pl\b\.?/g, "pl")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The index decompounds German words ("Odeonsplatz" also matches "Platzl"),
 * so re-rank candidates by how well their street name matches the query.
 */
function rerank(hits: EsHit[], street: string): EsHit[] {
  const want = streetKey(street);
  const rank = (h: EsHit) => {
    const k = streetKey(h._source.properties.strasse ?? h._source.properties.address ?? "");
    if (k === want) return 0;
    if (k.startsWith(want) || want.startsWith(k)) return 1;
    if (k.includes(want)) return 2;
    return 3;
  };
  return hits
    .map((h, i) => ({ h, r: rank(h), i }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.h);
}

async function cityIndex(q: string): Promise<GeocodeHit[]> {
  const first = await cityIndexOnce(q);
  if (first.length) return first;
  // "Rosenheimerstr 5" is written as "Rosenheimer Straße 5" in the index.
  const spaced = q.replace(/([a-zäöüß])(str(?:aße|asse|\.)?|platz|weg|allee|ring)(?=\s|\d|$)/i, "$1 $2");
  return spaced !== q ? cityIndexOnce(spaced) : first;
}

async function cityIndexOnce(q: string): Promise<GeocodeHit[]> {
  const { street, number, suffix } = parseAddress(q);
  if (!street) return [];
  const prefix = streetPrefix(street);
  if (number !== undefined) {
    const hits = rerank(
      await es({
        query: {
          bool: {
            must: [{ match_phrase_prefix: { "properties.searchfield": { query: prefix } } }],
            filter: [{ term: { "properties.type": "Address" } }, { term: { "properties.nr": number } }],
          },
        },
        size: 40,
      }),
      street,
    );
    if (hits.length) {
      const bySuffix = suffix ? hits.filter((h) => (h._source.properties.zusatz ?? "").trim().toLowerCase() === suffix) : [];
      const plain = hits.filter((h) => !(h._source.properties.zusatz ?? "").trim());
      const ordered = [...bySuffix, ...plain, ...hits.filter((h) => !bySuffix.includes(h) && !plain.includes(h))];
      return ordered.slice(0, 5).map((h) => toHit(h, "exact"));
    }
    // Number not found: take the nearest existing house number on that street.
    const street_ = rerank(
      await es({
        query: {
          bool: {
            must: [{ match_phrase_prefix: { "properties.searchfield": { query: prefix } } }],
            filter: [{ term: { "properties.type": "Address" } }],
          },
        },
        size: 400,
      }),
      street,
    );
    if (street_.length) {
      const sameStreet = street_.filter((h) => h._source.properties.strasse === street_[0]._source.properties.strasse);
      sameStreet.sort((a, b) => Math.abs((a._source.properties.nr ?? 0) - number) - Math.abs((b._source.properties.nr ?? 0) - number));
      return sameStreet.slice(0, 3).map((h) => toHit(h, "nearest-house-number"));
    }
    return [];
  }
  const hits = rerank(
    await es({
      query: {
        bool: {
          must: [{ match_phrase_prefix: { "properties.searchfield": { query: prefix } } }],
          filter: [{ term: { "properties.type": "Street" } }],
        },
      },
      size: 25,
    }),
    street,
  );
  return hits.slice(0, 5).map((h) => toHit(h, "street"));
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; city?: string; district?: string; postcode?: string; osm_value?: string };
}

/** `wide`: the whole MVV region (airport, surrounding towns) instead of the city only. */
async function photon(q: string, wide = false): Promise<GeocodeHit[]> {
  const bbox = wide ? "10.9,47.7,12.3,48.6" : "11.36,48.06,11.73,48.25";
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(wide ? q : `${q} München`)}` +
    `&lat=${MUNICH_CENTER.lat}&lon=${MUNICH_CENTER.lon}&limit=5&lang=de&bbox=${bbox}`;
  const res = await fetchJson<{ features: PhotonFeature[] }>(url, { timeoutMs: 8000 });
  return (res.features ?? [])
    .map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const parts = [p.name, [p.street, p.housenumber].filter(Boolean).join(" "), p.district].filter((x) => x && x.trim());
      const inCity = withinMunich({ lon, lat }, 0);
      return {
        lon,
        lat,
        label: `${[...new Set(parts)].join(", ")}${inCity ? ", München" : p.city ? `, ${p.city}` : ""}`,
        kind: "place" as const,
        precision: "place" as const,
        source: "photon" as const,
      };
    })
    .filter((h) => wide || withinMunich(h));
}

export async function geocode(query: string, opts: { wide?: boolean } = {}): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (!q) return [];
  if (opts.wide) {
    const { value } = await liveCache.get(`geocode:wide:${q.toLowerCase()}`, DAY, () => photon(q, true).catch(() => [] as GeocodeHit[]));
    if (value.length) return value;
  }
  const key = `geocode:${q.toLowerCase()}`;
  const { value } = await liveCache.get(key, DAY, async () => {
    let hits: GeocodeHit[] = [];
    try {
      hits = await cityIndex(q);
    } catch (err) {
      console.warn(`[geocode] city index failed for "${q}": ${String(err)}`);
    }
    const hasNumber = parseAddress(q).number !== undefined;
    if (!hits.length || (!hasNumber && hits[0]?.kind === "street" && !looksLikeStreet(q))) {
      try {
        const p = await photon(q);
        hits = hasNumber ? [...hits, ...p] : [...p, ...hits];
      } catch (err) {
        console.warn(`[geocode] photon failed for "${q}": ${String(err)}`);
      }
    }
    return hits;
  });
  return value;
}

function looksLikeStreet(q: string): boolean {
  return /(str(\.|asse|aße)?|weg|platz|pl\.|allee|ring|gasse|anger|berg|damm|ufer|steig|bogen|hof)\b/i.test(q);
}

export class LocationError extends Error {}

/** Resolve tool input (address text or coordinates) to a point in Munich. */
export async function resolveLocation(input: { address?: string; lat?: number; lon?: number }): Promise<ResolvedLocation> {
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    const loc: ResolvedLocation = { lat: input.lat, lon: input.lon, label: `${input.lat.toFixed(5)}, ${input.lon.toFixed(5)}`, precision: "coordinates", source: "input" };
    if (!withinMunich(loc)) loc.warning = "These coordinates are outside the City of Munich; most layers only cover the city area.";
    return loc;
  }
  if (!input.address?.trim()) throw new LocationError("Provide either an address (e.g. 'Marienplatz 8') or lat/lon coordinates.");
  const hits = await geocode(input.address);
  const best = hits[0];
  if (!best) throw new LocationError(`Could not find "${input.address}" in Munich. Try "Street number" (e.g. "Rosenheimer Str. 5") or a landmark name.`);
  const loc: ResolvedLocation = {
    lat: best.lat,
    lon: best.lon,
    label: best.label,
    precision: best.precision,
    source: best.source,
    citation: cite(best.source === "photon" ? "photon" : "addressIndex", Date.now()),
  };
  if (best.precision === "nearest-house-number") loc.warning = `House number not found; using the nearest existing number: ${best.label}.`;
  return loc;
}

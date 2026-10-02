import { PNG } from "pngjs";
import { config } from "../config.js";
import { liveCache } from "../lib/cache.js";
import { haversine, type LonLat } from "../lib/geo.js";
import { fetchText, HttpError } from "../lib/http.js";
import { cite, type Citation } from "../lib/sources.js";

/**
 * Environmental risks at an address from the Bavarian Environment Agency
 * (LfU, CC BY 4.0): EU environmental noise maps 2022 for the Munich
 * agglomeration (road, tram/U-Bahn, industry; Lden and Lnight in dB(A)) and
 * flood hazard areas (frequent, 100-year, extreme flood; designated zones).
 */

const NOISE_WMS = "https://www.lfu.bayern.de/gdi/wms/laerm/ballungsraeume";
const FLOOD_WMS = "https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete";

export const NOISE_LAYERS = [
  { id: "road_lden", layer: "aggroadlden2022", source: "road traffic", metric: "Lden" },
  { id: "road_lnight", layer: "aggroadln2022", source: "road traffic", metric: "Lnight" },
  { id: "rail_lden", layer: "aggraillden2022", source: "tram and U-Bahn", metric: "Lden" },
  { id: "rail_lnight", layer: "aggrailln2022", source: "tram and U-Bahn", metric: "Lnight" },
  { id: "industry_lden", layer: "aggindlden2022", source: "industrial plants", metric: "Lden" },
] as const;

/**
 * Legend colours of the LfU noise maps and the lower bound of their 5 dB band.
 * Lden and Lnight share colours per band (Lnight starts at 50, Lden at 55).
 */
const BANDS: { rgb: [number, number, number]; lo: number }[] = [
  { rgb: [184, 214, 209], lo: 50 },
  { rgb: [226, 242, 191], lo: 55 },
  { rgb: [243, 198, 131], lo: 60 },
  { rgb: [205, 70, 62], lo: 65 },
  { rgb: [117, 8, 92], lo: 70 },
  { rgb: [67, 10, 74], lo: 75 },
];

const bandOf = (r: number, g: number, b: number) =>
  BANDS.find((c) => Math.abs(c.rgb[0] - r) + Math.abs(c.rgb[1] - g) + Math.abs(c.rgb[2] - b) < 24)?.lo;

/** "70-74 dB(A)"; the top class of each map is open-ended (Lden 75+, Lnight 70+). */
export function bandLabel(lo: number, metric: string): string {
  const top = metric === "Lnight" ? 70 : 75;
  return lo >= top ? `${top} dB(A) or more` : `${lo}-${lo + 4} dB(A)`;
}

/**
 * Parse LfU's text/plain GetFeatureInfo: "@layer name1; name2; value1; value2;".
 * Empty values are kept so names and values stay aligned.
 */
export function parseGfiText(text: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const block of text.split(/(?:^|\n)@(?=\w)/).slice(1)) {
    const tokens = block.replace(/^\S+/, "").split(";").map((t) => t.trim());
    if (tokens.length && tokens[tokens.length - 1] === "") tokens.pop();
    if (tokens.length < 2 || tokens.length % 2) continue;
    const n = tokens.length / 2;
    const rec: Record<string, string> = {};
    for (let i = 0; i < n; i++) rec[tokens[i]] = tokens[n + i];
    out.push(rec);
  }
  return out;
}

async function gfi(base: string, layer: string, p: LonLat): Promise<Record<string, string>[]> {
  const d = 0.0002;
  const q = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetFeatureInfo",
    layers: layer,
    query_layers: layer,
    styles: "",
    crs: "CRS:84",
    bbox: `${p.lon - d},${p.lat - d},${p.lon + d},${p.lat + d}`,
    width: "101",
    height: "101",
    i: "50",
    j: "50",
    info_format: "text/plain",
    feature_count: "5",
  });
  try {
    return parseGfiText(await fetchText(`${base}?${q}`, { timeoutMs: 15_000 }));
  } catch (err) {
    // The LfU ArcGIS services answer "no feature here" with HTTP 400.
    if (err instanceof HttpError && err.status === 400) return [];
    throw err;
  }
}

async function tile(layer: string, at: LonLat, halfM: number, px: number): Promise<{ png: PNG; minLon: number; maxLat: number; dLon: number; dLat: number }> {
  const dLat = halfM / 111_320;
  const dLon = halfM / (111_320 * Math.cos((at.lat * Math.PI) / 180));
  const q = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetMap",
    layers: layer,
    styles: "",
    crs: "CRS:84",
    bbox: `${at.lon - dLon},${at.lat - dLat},${at.lon + dLon},${at.lat + dLat}`,
    width: String(px),
    height: String(px),
    format: "image/png",
    transparent: "true",
  });
  const res = await fetch(`${NOISE_WMS}?${q}`, { headers: { "User-Agent": config.userAgent }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`LfU noise map HTTP ${res.status}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  return { png, minLon: at.lon - dLon, maxLat: at.lat + dLat, dLon: (2 * dLon) / px, dLat: (2 * dLat) / px };
}

export interface NoiseValue {
  id: string;
  source: string;
  metric: string;
  /** Exact modelled level in dB(A), when the service returned it. */
  db: number | null;
  /** The 5 dB legend band, e.g. "70-74 dB(A)". */
  band: string | null;
  distance_m?: number;
}

/**
 * Loudest mapped level within `radiusM` of the point. Address points usually
 * fall inside the building footprint, where the raster has no value, so we
 * render a small tile, take the loudest legend band nearby (usually the
 * street-facing facade) and read the exact value at interior cells of it.
 */
async function loudestNear(layer: (typeof NOISE_LAYERS)[number], at: LonLat, radiusM: number): Promise<NoiseValue> {
  const px = 48;
  const t = await tile(layer.layer, at, radiusM, px);
  const lo = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= px || y >= px) return undefined;
    const i = (y * px + x) * 4;
    return t.png.data[i + 3] < 200 ? undefined : bandOf(t.png.data[i], t.png.data[i + 1], t.png.data[i + 2]);
  };
  const cands: { lo: number; d: number; interior: boolean; lon: number; lat: number }[] = [];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const b = lo(x, y);
      if (b === undefined) continue;
      const lon = t.minLon + (x + 0.5) * t.dLon;
      const lat = t.maxLat - (y + 0.5) * t.dLat;
      const d = haversine(at, { lon, lat });
      if (d > radiusM) continue;
      let interior = true;
      for (let dy = -2; dy <= 2 && interior; dy++) for (let dx = -2; dx <= 2 && interior; dx++) if (lo(x + dx, y + dy) !== b) interior = false;
      cands.push({ lo: b, d, interior, lon, lat });
    }
  }
  const base = { id: layer.id, source: layer.source, metric: layer.metric };
  if (!cands.length) return { ...base, db: null, band: null };
  const top = Math.max(...cands.map((c) => c.lo));
  const best = cands.filter((c) => c.lo === top).sort((a, b) => Number(b.interior) - Number(a.interior) || a.d - b.d);
  // Exact values at up to three interior cells of the loudest band.
  const reads = await Promise.all(
    best.slice(0, 3).map(async (c) => {
      const recs = await gfi(NOISE_WMS, layer.layer, c).catch(() => []);
      const v = Number(recs[0]?.["Classify.Pixel Value"]);
      return Number.isFinite(v) ? { v, d: c.d } : undefined;
    }),
  );
  const exact = reads.filter((r) => r !== undefined).sort((a, b) => b.v - a.v)[0];
  return { ...base, db: exact ? Math.round(exact.v * 10) / 10 : null, band: bandLabel(top, layer.metric), distance_m: Math.round(exact?.d ?? best[0].d) };
}

export interface NoiseReport {
  values: NoiseValue[];
  verdict: string;
  citation: Citation;
}

/** The level used for the verdict: exact value, else the lower bound of its band. */
const level = (v?: NoiseValue) => v?.db ?? (v?.band ? Number(v.band.slice(0, 2)) : null);

export async function noiseAt(at: LonLat, radiusM = 40): Promise<NoiseReport> {
  const key = `noise:${at.lat.toFixed(5)},${at.lon.toFixed(5)}:${radiusM}`;
  // Failures throw (and are not cached); the maps are updated every five years.
  const { value, fetchedAt } = await liveCache.get(key, 30 * 86_400_000, () => Promise.all(NOISE_LAYERS.map((l) => loudestNear(l, at, radiusM))));
  const day = Math.max(0, ...value.filter((v) => v.metric === "Lden").map((v) => level(v) ?? 0));
  const night = Math.max(0, ...value.filter((v) => v.metric === "Lnight").map((v) => level(v) ?? 0));
  let verdict: string;
  if (!day && !night) verdict = "No road, tram/U-Bahn or industrial noise above the mapping thresholds (55 dB(A) Lden, 50 dB(A) Lnight) near this address.";
  else if (day >= 70 || night >= 60) verdict = "Very loud: the loudest side is well above 65 dB(A) Lden / 55 dB(A) Lnight, the levels commonly used in Germany as thresholds for noise action planning.";
  else if (day >= 65 || night >= 55) verdict = "Loud: the loudest side reaches the 65 dB(A) Lden / 55 dB(A) Lnight thresholds commonly used for noise action planning.";
  else verdict = "Moderate: mapped noise below the action-planning thresholds, but above the WHO recommendation for road traffic (53 dB Lden, 45 dB Lnight).";
  return { values: value, verdict, citation: cite("lfuNoise", fetchedAt) };
}

// ------------------------------------------------------------------ flood

export const FLOOD_LAYERS = [
  { id: "hq_haeufig", layer: "hwgf_hqhaeufig", label: "frequent flood (HQhäufig)" },
  { id: "hq100", layer: "hwgf_hq100", label: "100-year flood (HQ100, 1 % chance per year)" },
  { id: "hq_extrem", layer: "hwgf_hqextrem", label: "extreme flood (HQextrem)" },
  { id: "protected_hq100", layer: "hwgg_hq100", label: "area protected against HQ100 (would flood if defences fail)" },
  { id: "designated", layer: "festsetzung", label: "officially designated flood zone (festgesetztes Überschwemmungsgebiet)" },
  { id: "provisional", layer: "sicherung", label: "provisionally secured flood zone (vorläufig gesichert)" },
] as const;

export interface FloodReport {
  hits: { id: string; label: string; water?: string; determined?: string; authority?: string }[];
  verdict: string;
  citation: Citation;
}

export async function floodAt(at: LonLat): Promise<FloodReport> {
  const key = `flood:${at.lat.toFixed(5)},${at.lon.toFixed(5)}`;
  // Errors other than "no feature" propagate, so a service outage never reads as "safe".
  const { value, fetchedAt } = await liveCache.get(key, 30 * 86_400_000, async () => {
    const res = await Promise.all(
      FLOOD_LAYERS.map(async (l) => {
        const r = (await gfi(FLOOD_WMS, l.layer, at))[0];
        if (!r) return undefined;
        const date = r["Datum der Festsetzung"] || r["Ermittlungsdatum"];
        return { id: l.id, label: l.label, water: r["Gewässername"] || undefined, determined: date || undefined, authority: r["linkalias_Zuständiges Wasserwirtschaftsamt"] || undefined };
      }),
    );
    return res.filter((h) => h !== undefined);
  });
  const has = (id: string) => value.some((h) => h.id === id);
  let verdict: string;
  if (has("hq_haeufig")) verdict = "High flood risk: inside the area flooded by a frequent flood (HQhäufig).";
  else if (has("hq100") || has("designated") || has("provisional"))
    verdict = "Flood risk: inside the 100-year flood area and/or a designated flood zone. Building restrictions under the Water Resources Act (WHG) apply in designated zones.";
  else if (has("protected_hq100")) verdict = "Residual risk: protected by flood defences against a 100-year flood, but would be flooded if they failed.";
  else if (has("hq_extrem")) verdict = "Low but real risk: only an extreme flood (HQextrem) would reach this point.";
  else verdict = "Outside all mapped river flood hazard areas. Flash flooding from heavy rain is not covered by these maps.";
  return { hits: value, verdict, citation: cite("lfuFlood", fetchedAt) };
}

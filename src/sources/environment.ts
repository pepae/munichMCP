import { MUNICH_CENTER } from "../config.js";
import { liveCache, HOUR } from "../lib/cache.js";
import { containsPoint, distanceToFeature, haversine, representativePoint, roundGeometry, type GeoFeature, type LonLat } from "../lib/geo.js";
import { fetchJson, fetchText } from "../lib/http.js";
import { stripHtml } from "../lib/text.js";
import { cite, type Citation } from "../lib/sources.js";
import { getLayer } from "../lib/wfs.js";

/** Weather (DWD via Bright Sky), pollen (DWD) and Isar swimming zones (city). */

export interface WeatherNow {
  at: string;
  temperature_c?: number;
  condition?: string;
  icon?: string;
  wind_kmh?: number;
  gust_kmh?: number;
  humidity_pct?: number;
  cloud_cover_pct?: number;
  precipitation_last_hour_mm?: number;
  today?: { min_c?: number; max_c?: number; precipitation_mm?: number; max_wind_kmh?: number; sunshine_h?: number };
  tomorrow?: { min_c?: number; max_c?: number; precipitation_mm?: number };
  alerts: { event?: string; severity?: string; headline?: string; description?: string; onset?: string; expires?: string }[];
  warn_cell?: string;
  citation: Citation;
}

interface BsHour {
  timestamp: string;
  temperature?: number;
  precipitation?: number;
  wind_speed?: number;
  sunshine?: number;
}

const berlinDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

function daySummary(hours: BsHour[], day: string) {
  const hs = hours.filter((h) => berlinDate(new Date(h.timestamp)) === day);
  if (!hs.length) return undefined;
  const t = hs.map((h) => h.temperature).filter((x): x is number => typeof x === "number");
  const sum = (xs: (number | undefined)[]) => Math.round(xs.reduce<number>((a, b) => a + (b ?? 0), 0) * 10) / 10;
  return {
    min_c: t.length ? Math.round(Math.min(...t)) : undefined,
    max_c: t.length ? Math.round(Math.max(...t)) : undefined,
    precipitation_mm: sum(hs.map((h) => h.precipitation)),
    max_wind_kmh: Math.round(Math.max(...hs.map((h) => h.wind_speed ?? 0))),
    sunshine_h: Math.round((sum(hs.map((h) => h.sunshine)) / 60) * 10) / 10,
  };
}

export async function weatherNow(at: LonLat = { lat: MUNICH_CENTER.lat, lon: MUNICH_CENTER.lon }): Promise<WeatherNow> {
  const key = `weather:${at.lat.toFixed(2)},${at.lon.toFixed(2)}`;
  const { value, fetchedAt } = await liveCache.get(key, 15 * 60_000, async () => {
    const today = berlinDate(new Date());
    const tomorrow = berlinDate(new Date(Date.now() + 86_400_000));
    const [cur, fc, al] = await Promise.all([
      fetchJson<{ weather: Record<string, any> }>(`https://api.brightsky.dev/current_weather?lat=${at.lat}&lon=${at.lon}`),
      fetchJson<{ weather: BsHour[] }>(`https://api.brightsky.dev/weather?lat=${at.lat}&lon=${at.lon}&date=${today}&last_date=${tomorrow}T23:00&tz=Europe/Berlin`),
      fetchJson<{ alerts: Record<string, any>[]; location?: { name?: string } }>(`https://api.brightsky.dev/alerts?lat=${at.lat}&lon=${at.lon}`).catch(() => ({ alerts: [], location: undefined })),
    ]);
    return { cur: cur.weather, hours: fc.weather, alerts: al.alerts, cell: al.location?.name, today, tomorrow };
  });
  const w = value.cur;
  return {
    at: w.timestamp,
    temperature_c: w.temperature,
    condition: w.condition,
    icon: w.icon,
    wind_kmh: w.wind_speed_10 ?? w.wind_speed_30,
    gust_kmh: w.wind_gust_speed_10,
    humidity_pct: w.relative_humidity,
    cloud_cover_pct: w.cloud_cover,
    precipitation_last_hour_mm: w.precipitation_60,
    today: daySummary(value.hours, value.today),
    tomorrow: daySummary(value.hours, value.tomorrow),
    alerts: value.alerts.map((a) => ({ event: a.event_en ?? a.event_de, severity: a.severity, headline: a.headline_en ?? a.headline_de, description: a.description_en ?? a.description_de, onset: a.onset, expires: a.expires })),
    warn_cell: value.cell,
    citation: cite("dwd", fetchedAt),
  };
}

const POLLEN_EN: Record<string, string> = { Hasel: "hazel", Erle: "alder", Esche: "ash", Birke: "birch", Graeser: "grasses", Roggen: "rye", Beifuss: "mugwort", Ambrosia: "ragweed" };
const POLLEN_LEVEL: Record<string, string> = { "0": "none", "0-1": "none to low", "1": "low", "1-2": "low to medium", "2": "medium", "2-3": "medium to high", "3": "high" };

export async function pollen(): Promise<{ region: string; updated?: string; types: { type: string; today: string; tomorrow: string; day_after: string }[]; citation: Citation }> {
  const { value, fetchedAt } = await liveCache.get("pollen", 3 * HOUR, () =>
    fetchJson<{ last_update?: string; content: { partregion_id: number; partregion_name: string; Pollen: Record<string, { today: string; tomorrow: string; dayafter_to: string }> }[] }>(
      "https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json",
    ),
  );
  // Munich lies in DWD pollen part-region 121 (Allgäu/Oberbayern/Bayerischer Wald).
  const r = value.content.find((c) => c.partregion_id === 121);
  const types = Object.entries(r?.Pollen ?? {}).map(([k, v]) => ({
    type: `${POLLEN_EN[k] ?? k} (${k})`,
    today: POLLEN_LEVEL[v.today] ?? v.today,
    tomorrow: POLLEN_LEVEL[v.tomorrow] ?? v.tomorrow,
    day_after: POLLEN_LEVEL[v.dayafter_to] ?? v.dayafter_to,
  }));
  return { region: "Oberbayern (DWD part-region 121)", updated: value.last_update, types, citation: cite("dwdPollen", fetchedAt) };
}

// ------------------------------------------------------------ Air quality (UBA)

const UBA = "https://luftdaten.umweltbundesamt.de/api/air-data/v3";
/** Official measuring stations in Munich (LfU network, via the UBA API). */
export const AIR_STATIONS = [
  { id: 471, code: "DEBY037", name: "München/Stachus", lat: 48.1373, lon: 11.5649, type: "traffic" },
  { id: 473, code: "DEBY039", name: "München/Lothstraße", lat: 48.1545, lon: 11.5547, type: "urban background" },
  { id: 523, code: "DEBY089", name: "München/Johanneskirchen", lat: 48.1732, lon: 11.648, type: "suburban background" },
  { id: 535, code: "DEBY115", name: "München/Landshuter Allee", lat: 48.1496, lon: 11.5365, type: "traffic" },
  { id: 609, code: "DEBY189", name: "München/Allach", lat: 48.1817, lon: 11.4645, type: "suburban background" },
];
const AQI = ["very good", "good", "moderate", "poor", "very poor"];

export async function airQuality(at: LonLat) {
  const st = [...AIR_STATIONS].sort((a, b) => haversine(at, a) - haversine(at, b))[0];
  const { value: comps } = await liveCache.get("uba:components", 24 * HOUR, async () => {
    const r = await fetchJson<Record<string, any>>(`${UBA}/components/json?lang=en&index=id`);
    const out: Record<string, { code: string; unit: string }> = {};
    for (const [k, v] of Object.entries(r)) if (Array.isArray(v)) out[k] = { code: String(v[1]).replace("PM2", "PM2.5"), unit: String(v[3]) };
    return out;
  });
  const day = berlinDate(new Date());
  const yesterday = berlinDate(new Date(Date.now() - 86_400_000));
  const { value, fetchedAt } = await liveCache.get(`uba:${st.id}:${day}`, 30 * 60_000, () =>
    fetchJson<{ data: Record<string, Record<string, any[]>> }>(`${UBA}/airquality/json?date_from=${yesterday}&time_from=1&date_to=${day}&time_to=24&station=${st.id}&lang=en`),
  );
  const series = value.data?.[String(st.id)] ?? {};
  const latestKey = Object.keys(series).sort().at(-1);
  if (!latestKey) throw new Error(`no recent measurements for ${st.name}`);
  const row = series[latestKey];
  const components = row
    .slice(3)
    .filter(Array.isArray)
    .map((c: any[]) => ({ name: comps[String(c[0])]?.code ?? `component ${c[0]}`, value: Number(c[1]), unit: comps[String(c[0])]?.unit ?? "µg/m³", index: AQI[Number(c[2])] }));
  return {
    station: st.name,
    station_type: st.type,
    distance_m: Math.round(haversine(at, st)),
    measured_at: `${latestKey} CET`,
    index: AQI[Number(row[1])],
    components,
    citation: cite("uba", fetchedAt),
  };
}

// ---------------------------------------------------------------- Isar gauge

const HND_MUC = "https://www.hnd.bayern.de/pegel/isar/muenchen-16005701";
const GKD_TEMP = "https://www.gkd.bayern.de/de/fluesse/wassertemperatur/bayern/muenchen-16005701/messwerte";

export interface Gauge {
  name: string;
  water_level_cm?: number;
  discharge_m3s?: number;
  water_temp_c?: number;
  measured_at?: string;
  flood_level?: string;
  thresholds_cm?: Record<string, number>;
  url: string;
}

const num = (s?: string) => (s === undefined ? undefined : Number(s.replace(/\./g, "").replace(",", ".")));

export async function isarGauges(): Promise<{ gauges: Gauge[]; note?: string; citation: Citation }> {
  const { value, fetchedAt } = await liveCache.get("isar:gauges", 15 * 60_000, async () => {
    const [levelHtml, flowHtml, tempHtml] = await Promise.all([
      fetchText(HND_MUC),
      fetchText(`${HND_MUC}/abfluss?`).catch(() => ""),
      fetchText(GKD_TEMP).catch(() => ""),
    ]);
    const text = (h: string) => stripHtml(h).replace(/\s+/g, " ");
    const lv = /Letzter Messwert vom ([\d.]+ [\d:]+) Uhr:\s*([\d.,]+)\s*cm/.exec(text(levelHtml));
    const fl = /Letzter Messwert vom [\d.]+ [\d:]+ Uhr:\s*([\d.,]+)\s*m³\/s/.exec(text(flowHtml));
    const thresholds: Record<string, number> = {};
    for (const m of text(levelHtml).matchAll(/Meldestufe (\d)\s+([\d.]+) cm/g)) thresholds[`Meldestufe ${m[1]}`] = Number(m[2]);
    const tp = /<td[^>]*>\s*([\d.]+ [\d:]+) Uhr\s*<\/td>\s*<td[^>]*>\s*([\d,.-]+)\s*<\/td>/.exec(tempHtml);
    return { lv, fl, thresholds, tp: tp ? [tp[1], tp[2]] : undefined };
  });
  const level = num(value.lv?.[2]);
  let flood: string | undefined;
  if (level !== undefined && Object.keys(value.thresholds).length) {
    const reached = Object.entries(value.thresholds).filter(([, cm]) => level >= cm).map(([k]) => k);
    flood = reached.length ? `${reached.at(-1)} reached` : `no flood warning level (Meldestufe 1 starts at ${value.thresholds["Meldestufe 1"]} cm)`;
  }
  return {
    gauges: [
      {
        name: "Isar, gauge München (16005701)",
        water_level_cm: level,
        discharge_m3s: num(value.fl?.[1]),
        water_temp_c: num(value.tp?.[1]),
        measured_at: value.lv?.[1],
        flood_level: flood,
        thresholds_cm: value.thresholds,
        url: HND_MUC,
      },
    ],
    note: value.tp ? `Water temperature measured ${value.tp[0]} (GKD Bayern).` : undefined,
    citation: cite("gkd", fetchedAt),
  };
}

/**
 * Official flood class for the Munich gauge from the cross-state flood portal
 * (CC BY 4.0; must show "Datenquelle: www.hochwasserzentralen.de" and "Stand").
 */
export async function floodClass(): Promise<{ lhp_class: number; label: string; stand: string; alerts: number; citation: Citation } | undefined> {
  const { value, fetchedAt } = await liveCache.get("lhp:BY", 5 * 60_000, async () => {
    const headers = { Accept: "application/json", "Accept-Language": "en" };
    const [st, al] = await Promise.all([
      fetchJson<{ updated?: string; data: { id: string; lhpClass: number; stateClassName?: string; timestamp?: string }[]; legend?: { items: { lhpClass: number; lhpClassName: string }[] } }>(
        "https://api.hochwasserzentralen.de/public/v1/data/stations?states=BY",
        { headers },
      ),
      fetchJson<{ data?: unknown[] }>("https://api.hochwasserzentralen.de/public/v1/data/alerts?states=BY", { headers }).catch(() => ({ data: [] })),
    ]);
    return { st, alerts: Array.isArray(al.data) ? al.data.length : 0 };
  });
  const g = value.st.data.find((d) => d.id === "BY_16005701");
  if (!g) return undefined;
  const legend = value.st.legend?.items.find((i) => i.lhpClass === g.lhpClass)?.lhpClassName;
  const stand = value.st.updated ? new Date(value.st.updated).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return {
    lhp_class: g.lhpClass,
    label: g.stateClassName ?? legend ?? String(g.lhpClass),
    stand,
    alerts: value.alerts,
    citation: { ...cite("floodPortal", fetchedAt), note: `Datenquelle: www.hochwasserzentralen.de, Stand: ${stand}` },
  };
}

// ------------------------------------------------------------ Isar swimming

export const ISAR_LAYERS = { swim: "rku_wfs:isar_baden", boat: "rku_wfs:isar_boot", danger: "rku_wfs:isar_gefahrenstellen" } as const;

export interface IsarSpot {
  water_body?: string;
  swimming: "allowed" | "prohibited" | "outside-zones";
  boating?: "allowed" | "prohibited";
  nearest_allowed_zone_m?: number;
  danger_spots: { name: string; warning: string; distance_m: number; lat: number; lon: number }[];
  zones: { geometry: GeoFeature["geometry"]; allowed: boolean }[];
}

export async function isarSpot(at: LonLat): Promise<IsarSpot> {
  const [swim, boat, danger] = await Promise.all([getLayer(ISAR_LAYERS.swim), getLayer(ISAR_LAYERS.boat), getLayer(ISAR_LAYERS.danger)]);
  const allowed = (f: GeoFeature) => /erlaubt/i.test(String(f.properties.badeverbot ?? ""));
  const inside = swim.features.filter((f) => containsPoint(f, at));
  const insideBoat = boat.features.filter((f) => containsPoint(f, at));
  const near = swim.features
    .filter(allowed)
    .map((f) => distanceToFeature(f, at))
    .sort((a, b) => a - b)[0];
  const zones = swim.features
    .map((f) => ({ f, d: distanceToFeature(f, at) }))
    .filter((x) => x.d < 1500)
    .map(({ f }) => ({ geometry: roundGeometry(f.geometry), allowed: allowed(f) }));
  return {
    water_body: inside[0]?.properties.bwbez ?? insideBoat[0]?.properties.bwbez,
    swimming: inside.length ? (inside.some(allowed) ? "allowed" : "prohibited") : "outside-zones",
    boating: insideBoat.length ? (insideBoat.some((f) => /erlaubt/i.test(String(f.properties.fahrverbot ?? ""))) ? "allowed" : "prohibited") : undefined,
    nearest_allowed_zone_m: near === undefined ? undefined : Math.round(near),
    danger_spots: danger.features
      .map((f) => ({ f, d: distanceToFeature(f, at), c: representativePoint(f)! }))
      .filter((x) => x.d < 2000)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map(({ f, d, c }) => ({ name: String(f.properties.lage ?? "Gefahrenstelle"), warning: String(f.properties.warning ?? f.properties.hinweis ?? ""), distance_m: Math.round(d), lat: c.lat, lon: c.lon })),
    zones,
  };
}

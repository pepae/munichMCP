import { liveCache, DAY } from "../lib/cache.js";
import { haversine, type LonLat } from "../lib/geo.js";
import { fetchJson } from "../lib/http.js";
import { cite, type Citation } from "../lib/sources.js";
import { stripHtml } from "../lib/text.js";

/**
 * Munich public transport via the (unofficial, tolerated) MVG JSON API that
 * powers mvg.de. We cache aggressively so traffic stays "moderate":
 * departures 30 s per station, stations 1 day, messages 3 min.
 */

const MVG = "https://www.mvg.de/api/bgw-pt/v3";
export const TRANSPORT_TYPES = ["UBAHN", "SBAHN", "TRAM", "BUS", "REGIONAL_BUS", "BAHN", "SCHIFF", "RUFTAXI"] as const;

export interface Station {
  id: string;
  name: string;
  place: string;
  lat: number;
  lon: number;
  transport_types: string[];
  tariff_zones?: string;
  distance_m?: number;
}

export interface Departure {
  line: string;
  transport_type: string;
  destination: string;
  planned: string;
  expected: string;
  in_minutes: number;
  delay_min?: number;
  realtime: boolean;
  cancelled: boolean;
  platform?: string | number;
  replacement_service?: boolean;
  occupancy?: string;
  notes: string[];
}

interface RawLoc {
  globalId: string;
  name: string;
  place: string;
  latitude: number;
  longitude: number;
  transportTypes?: string[];
  tariffZones?: string;
  distanceInMeters?: number;
  type?: string;
}

const toStation = (r: RawLoc): Station => ({
  id: r.globalId,
  name: r.name,
  place: r.place,
  lat: r.latitude,
  lon: r.longitude,
  transport_types: r.transportTypes ?? [],
  tariff_zones: r.tariffZones,
  distance_m: r.distanceInMeters,
});

export async function searchStations(query: string): Promise<Station[]> {
  const q = query.trim();
  const { value } = await liveCache.get(`mvg:loc:${q.toLowerCase()}`, DAY, async () => {
    const r = await fetchJson<RawLoc[]>(`${MVG}/locations?query=${encodeURIComponent(q)}&locationTypes=STATION`, { timeoutMs: 10_000 });
    return r.filter((x) => x.globalId).map(toStation);
  });
  return value;
}

export async function nearbyStations(at: LonLat, n = 5): Promise<Station[]> {
  const key = `mvg:near:${at.lat.toFixed(4)},${at.lon.toFixed(4)}`;
  const { value } = await liveCache.get(key, DAY, async () => {
    const r = await fetchJson<RawLoc[]>(`${MVG}/stations/nearby?latitude=${at.lat}&longitude=${at.lon}`, { timeoutMs: 10_000 });
    return r.map(toStation).map((s) => ({ ...s, distance_m: s.distance_m ?? Math.round(haversine(at, s)) }));
  });
  return value.slice(0, n);
}

interface RawDep {
  plannedDepartureTime: number;
  realtimeDepartureTime?: number;
  realtime: boolean;
  delayInMinutes?: number;
  transportType: string;
  label: string;
  destination: string;
  cancelled: boolean;
  sev?: boolean;
  platform?: number | string;
  platformChanged?: boolean;
  occupancy?: string;
  messages?: unknown[];
  infos?: { message?: string; type?: string }[];
}

export async function departures(stationId: string, opts: { limit?: number; types?: string[]; offsetMin?: number } = {}): Promise<{ items: Departure[]; fetchedAt: number; stale: boolean; citation: Citation }> {
  const limit = Math.min(opts.limit ?? 12, 40);
  const types = opts.types?.length ? `&transportTypes=${opts.types.join(",")}` : "";
  const url = `${MVG}/departures?globalId=${encodeURIComponent(stationId)}&limit=${limit}&offsetInMinutes=${opts.offsetMin ?? 0}${types}`;
  const { value, fetchedAt, stale } = await liveCache.get(`mvg:dep:${url}`, 30_000, () => fetchJson<RawDep[]>(url, { timeoutMs: 10_000 }));
  const now = Date.now();
  const items = value.map((d) => {
    const t = d.realtimeDepartureTime ?? d.plannedDepartureTime;
    return {
      line: d.label,
      transport_type: d.transportType,
      destination: d.destination,
      planned: new Date(d.plannedDepartureTime).toISOString(),
      expected: new Date(t).toISOString(),
      in_minutes: Math.max(0, Math.round((t - now) / 60_000)),
      delay_min: d.delayInMinutes,
      realtime: d.realtime,
      cancelled: d.cancelled,
      platform: d.platform,
      replacement_service: d.sev || undefined,
      occupancy: d.occupancy && d.occupancy !== "UNKNOWN" ? d.occupancy : undefined,
      notes: (d.infos ?? []).map((i) => stripHtml(i.message ?? "")).filter(Boolean),
    };
  });
  return { items, fetchedAt, stale, citation: cite("mvg", fetchedAt) };
}

interface RawMsg {
  title: string;
  description?: string;
  publication?: number;
  validFrom?: number;
  validTo?: number;
  type: string;
  provider?: string;
  links?: { text: string; url: string }[];
  lines?: { label: string; transportType: string }[];
  incidentDurations?: { from: number; to: number }[];
}

export interface TransitMessage {
  type: string;
  title: string;
  text: string;
  lines: string[];
  valid_from?: string;
  valid_to?: string;
  links: { text: string; url: string }[];
}

export async function transitMessages(opts: { line?: string; type?: "INCIDENT" | "SCHEDULE_CHANGE" | "ALL" } = {}): Promise<{ items: TransitMessage[]; fetchedAt: number; citation: Citation }> {
  const { value, fetchedAt } = await liveCache.get("mvg:messages", 180_000, () => fetchJson<RawMsg[]>(`${MVG}/messages`, { timeoutMs: 15_000 }));
  const line = opts.line?.trim().toUpperCase().replace(/\s+/g, "");
  const now = Date.now();
  const items = value
    .filter((m) => !opts.type || opts.type === "ALL" || m.type === opts.type)
    .filter((m) => !line || (m.lines ?? []).some((l) => l.label.toUpperCase().replace(/\s+/g, "") === line))
    .filter((m) => !m.validTo || m.validTo > now)
    .map((m) => ({
      type: m.type,
      title: m.title,
      text: stripHtml(m.description ?? "").slice(0, 1200),
      lines: [...new Set((m.lines ?? []).map((l) => l.label))],
      valid_from: m.validFrom ? new Date(m.validFrom).toISOString() : undefined,
      valid_to: m.validTo ? new Date(m.validTo).toISOString() : undefined,
      links: (m.links ?? []).slice(0, 3),
    }))
    .sort((a, b) => (a.type === "INCIDENT" ? -1 : 0) - (b.type === "INCIDENT" ? -1 : 0) || String(a.valid_from).localeCompare(String(b.valid_from)));
  return { items, fetchedAt, citation: cite("mvg", fetchedAt) };
}

// ------------------------------------------------------------ journey planner

export interface TripLeg {
  mode: string;
  line?: string;
  direction?: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  departure_delay_min?: number;
  arrival_delay_min?: number;
  platform?: string | number;
  distance_m?: number;
  cancelled?: boolean;
  path: [number, number][];
}

export interface Trip {
  departure: string;
  arrival: string;
  duration_min: number;
  changes: number;
  walking_m: number;
  zones: string[];
  legs: TripLeg[];
}

/** Google encoded polyline (precision 5) to [lat, lon] pairs. */
export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    for (const which of [0, 1]) {
      let shift = 0, res = 0, b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        res |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < s.length);
      const v = res & 1 ? ~(res >> 1) : res >> 1;
      if (which === 0) lat += v;
      else lon += v;
    }
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

const ZONE = (z: number) => (z === 0 ? "M" : String(z));

export async function planTrip(from: LonLat, to: LonLat, opts: { at?: string; arriveBy?: boolean; types?: string[] } = {}): Promise<{ trips: Trip[]; fetchedAt: number; citation: Citation }> {
  const when = opts.at ? new Date(opts.at) : new Date();
  const types = opts.types?.length ? opts.types.join(",") : "SCHIFF,UBAHN,TRAM,SBAHN,BUS,REGIONAL_BUS,BAHN";
  const url =
    `${MVG}/routes?originLatitude=${from.lat}&originLongitude=${from.lon}&destinationLatitude=${to.lat}&destinationLongitude=${to.lon}` +
    `&routingDateTime=${encodeURIComponent(when.toISOString())}&routingDateTimeIsArrival=${opts.arriveBy ? "true" : "false"}&transportTypes=${types}`;
  const { value, fetchedAt } = await liveCache.get(`mvg:route:${url.replace(/routingDateTime=[^&]+/, `t=${Math.floor(when.getTime() / 60_000)}`)}`, 60_000, () => fetchJson<any[]>(url, { timeoutMs: 20_000 }));
  const trips = value.slice(0, 5).map((c): Trip => {
    const legs: TripLeg[] = c.parts.map((p: any) => ({
      mode: p.line?.transportType ?? "PEDESTRIAN",
      line: p.line?.transportType === "PEDESTRIAN" ? undefined : p.line?.label,
      direction: p.line?.destination,
      from: p.from?.name,
      to: p.to?.name,
      departure: p.from?.plannedDeparture,
      arrival: p.to?.plannedDeparture,
      departure_delay_min: p.from?.departureDelayInMinutes ?? undefined,
      arrival_delay_min: p.to?.arrivalDelayInMinutes ?? undefined,
      platform: p.from?.platform,
      distance_m: p.distance ? Math.round(p.distance) : undefined,
      cancelled: p.isCancelled || undefined,
      path: p.pathPolyline ? decodePolyline(p.pathPolyline) : [],
    }));
    const dep = legs[0]?.departure ?? "";
    const arr = legs.at(-1)?.arrival ?? "";
    const rides = legs.filter((l) => l.mode !== "PEDESTRIAN");
    return {
      departure: dep,
      arrival: arr,
      duration_min: dep && arr ? Math.round((Date.parse(arr) - Date.parse(dep)) / 60_000) : 0,
      changes: Math.max(0, rides.length - 1),
      walking_m: legs.filter((l) => l.mode === "PEDESTRIAN").reduce((a, l) => a + (l.distance_m ?? 0), 0),
      zones: (c.ticketingInformation?.zones ?? []).map(ZONE),
      legs,
    };
  });
  return { trips, fetchedAt, citation: cite("mvg", fetchedAt) };
}

/** Pick a station from a name, a station id, or an address/point. */
export async function resolveStation(input: { station?: string; at?: LonLat }): Promise<Station> {
  if (input.station && /^de:\d{5}:\d+/.test(input.station)) {
    const r = await searchStations(input.station);
    if (r[0]) return r[0];
    return { id: input.station, name: input.station, place: "", lat: 0, lon: 0, transport_types: [] };
  }
  if (input.station) {
    const r = await searchStations(input.station);
    const munich = r.filter((s) => s.place === "München");
    const best = munich[0] ?? r[0];
    if (best) return best;
    throw new Error(`No MVG/MVV station matches "${input.station}".`);
  }
  if (input.at) {
    const r = await nearbyStations(input.at, 1);
    if (r[0]) return r[0];
  }
  throw new Error("Give a station name (e.g. 'Sendlinger Tor') or an address.");
}

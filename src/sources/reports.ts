import { liveCache } from "../lib/cache.js";
import { haversine, type LonLat } from "../lib/geo.js";
import { fetchJson } from "../lib/http.js";
import { cite, type Citation } from "../lib/sources.js";
import { stripHtml } from "../lib/text.js";

/**
 * Citizen damage reports from machmuenchenbesser.de (the city's reporting
 * platform, Open311 GeoReport v2, CC0). Read-only: we never create reports.
 */

const API = "https://machmuenchenbesser.de/api/georeport/v2";

export interface DamageReport {
  id: string;
  category: string;
  status: string;
  status_text?: string;
  reported: string;
  updated?: string;
  address?: string;
  description?: string;
  lat: number;
  lon: number;
  url: string;
  distance_m?: number;
}

interface RawReport {
  service_request_id: string;
  service_name?: string;
  status: string;
  requested_datetime: string;
  updated_datetime?: string;
  address_string?: string;
  description?: string;
  lat: number;
  long: number;
  extended_attributes?: { markaspot?: { status_descriptive_name?: string } };
}

async function reportsInBox(minLon: number, minLat: number, maxLon: number, maxLat: number): Promise<{ items: DamageReport[]; fetchedAt: number }> {
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const bbox = [minLon, minLat, maxLon, maxLat].map((v) => v.toFixed(4)).join(",");
  const { value, fetchedAt } = await liveCache.get(`mmb:${bbox}`, 5 * 60_000, async () => {
    const page = await fetchJson<{ requests: RawReport[] }>(
      `${API}/requests.json?extensions=true&meta=true&sort=desc&start_date=${since}&bbox=${bbox}&limit=500`,
      { timeoutMs: 20_000 },
    );
    return (page.requests ?? []).map(
      (r): DamageReport => ({
        id: r.service_request_id,
        category: r.service_name ?? "?",
        status: r.status,
        status_text: r.extended_attributes?.markaspot?.status_descriptive_name,
        reported: r.requested_datetime,
        updated: r.updated_datetime,
        address: r.address_string,
        description: r.description ? stripHtml(r.description).slice(0, 280) : undefined,
        lat: Number(r.lat),
        lon: Number(r.long),
        url: `https://machmuenchenbesser.de/requests/${r.service_request_id}`,
      }),
    );
  });
  return { items: value, fetchedAt };
}

export async function reportsNear(
  at: LonLat,
  opts: { radiusM?: number; status?: "open" | "closed" | "all"; query?: string; limit?: number } = {},
): Promise<{ items: DamageReport[]; total: number; citation: Citation }> {
  const radius = opts.radiusM ?? 300;
  const dLat = radius / 111_000;
  const dLon = radius / (111_000 * Math.cos((at.lat * Math.PI) / 180));
  const { items, fetchedAt } = await reportsInBox(at.lon - dLon, at.lat - dLat, at.lon + dLon, at.lat + dLat);
  const q = opts.query?.toLowerCase();
  const hits = items
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => ({ ...r, distance_m: Math.round(haversine(at, r)) }))
    .filter((r) => r.distance_m <= radius)
    .filter((r) => !opts.status || opts.status === "all" || r.status === opts.status)
    .filter((r) => !q || `${r.category} ${r.description ?? ""} ${r.address ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => a.distance_m! - b.distance_m!);
  return { items: hits.slice(0, opts.limit ?? 15), total: hits.length, citation: cite("damageReports", fetchedAt) };
}

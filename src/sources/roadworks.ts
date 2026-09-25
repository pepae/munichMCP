import { HOUR } from "../lib/cache.js";
import { distanceToFeature, representativePoint, roundGeometry, type GeoFeature, type LonLat } from "../lib/geo.js";
import { cite, type Citation } from "../lib/sources.js";
import { getLayer } from "../lib/wfs.js";

/** Roadworks and temporary no-parking zones for the next ~4 weeks (Mobilitätsreferat). */

export const ROADWORKS_LAYER = "mor_wfs:baustellen_opendata";

export interface Roadwork {
  where: string;
  kind?: string;
  affected?: string;
  impact?: string;
  description?: string;
  from?: string;
  until?: string;
  active_on_date: boolean;
  distance_m: number;
  lat: number;
  lon: number;
  geometry?: GeoFeature["geometry"];
}

function parseDe(s?: string | null): Date | undefined {
  const m = s ? /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s) : null;
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) : undefined;
}

export async function roadworksNear(
  at: LonLat,
  opts: { radiusM?: number; date?: string; limit?: number; includeGeometry?: boolean } = {},
): Promise<{ items: Roadwork[]; total: number; citation: Citation }> {
  const radius = Math.min(opts.radiusM ?? 300, 3000);
  const layer = await getLayer(ROADWORKS_LAYER, HOUR);
  const day = opts.date ? new Date(`${opts.date}T12:00:00`) : new Date();
  const pad = radius / 70_000;
  const hits: Roadwork[] = [];
  for (const f of layer.features) {
    const b = f.bbox;
    if (!b || at.lon < b[0] - pad || at.lon > b[2] + pad || at.lat < b[1] - pad || at.lat > b[3] + pad) continue;
    const d = distanceToFeature(f, at);
    if (d > radius) continue;
    const p = f.properties;
    const from = parseDe(p.beginn_datum_kombiniert);
    const until = parseDe(p.ende_datum_kombiniert);
    const active = (!from || from <= day) && (!until || day <= new Date(until.getTime() + 86_400_000));
    const c = representativePoint(f)!;
    hits.push({
      where: String(p.strasse_hausnr ?? "").trim(),
      kind: p.art ?? undefined,
      affected: p.betroffene_bereiche ?? undefined,
      impact: p.beeintraechtigung ?? undefined,
      description: p.beschreibung ?? undefined,
      from: p.beginn_datum_kombiniert ?? undefined,
      until: p.ende_datum_kombiniert ?? undefined,
      active_on_date: active,
      distance_m: Math.round(d),
      lat: c.lat,
      lon: c.lon,
      geometry: opts.includeGeometry ? roundGeometry(f.geometry) : undefined,
    });
  }
  hits.sort((a, b) => Number(b.active_on_date) - Number(a.active_on_date) || a.distance_m - b.distance_m);
  return { items: hits.slice(0, opts.limit ?? 15), total: hits.length, citation: cite("roadworks", layer.fetchedAt) };
}

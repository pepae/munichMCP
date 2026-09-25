import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { MUNICH_BBOX } from "../config.js";

export interface LonLat {
  lon: number;
  lat: number;
}

export type BBox = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

export interface GeoFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: any } | null;
  properties: Record<string, any>;
  bbox?: BBox;
}

const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LonLat, b: LonLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function geometryBBox(geometry: GeoFeature["geometry"]): BBox | undefined {
  if (!geometry) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: any) => {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    } else for (const x of c) walk(x);
  };
  walk(geometry.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : undefined;
}

export function inBBox(p: LonLat, b: BBox, padDeg = 0): boolean {
  return p.lon >= b[0] - padDeg && p.lon <= b[2] + padDeg && p.lat >= b[1] - padDeg && p.lat <= b[3] + padDeg;
}

export function isPolygonal(f: GeoFeature): boolean {
  return f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon";
}

export function containsPoint(f: GeoFeature, p: LonLat): boolean {
  if (!f.geometry || !isPolygonal(f)) return false;
  if (f.bbox && !inBBox(p, f.bbox)) return false;
  return booleanPointInPolygon([p.lon, p.lat], f.geometry as any);
}

/** Representative point: the point itself, or the bbox centre for lines/polygons. */
export function representativePoint(f: GeoFeature): LonLat | undefined {
  const g = f.geometry;
  if (!g) return undefined;
  if (g.type === "Point") return { lon: g.coordinates[0], lat: g.coordinates[1] };
  if (g.type === "MultiPoint") return { lon: g.coordinates[0][0], lat: g.coordinates[0][1] };
  const b = f.bbox ?? geometryBBox(g);
  return b ? { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 } : undefined;
}

/**
 * Approximate distance in metres from a point to a feature:
 * 0 when inside a polygon, otherwise the distance to the nearest vertex/segment.
 */
export function distanceToFeature(f: GeoFeature, p: LonLat): number {
  const g = f.geometry;
  if (!g) return Infinity;
  if (g.type === "Point") return haversine(p, { lon: g.coordinates[0], lat: g.coordinates[1] });
  if (isPolygonal(f) && containsPoint(f, p)) return 0;
  let best = Infinity;
  // Project to a local equirectangular plane (accurate to <0.1% at city scale).
  const kx = Math.cos(rad(p.lat)) * R * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  const seg = (a: number[], b: number[]) => {
    const ax = (a[0] - p.lon) * kx, ay = (a[1] - p.lat) * ky;
    const bx = (b[0] - p.lon) * kx, by = (b[1] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  };
  const walkLine = (line: number[][]) => {
    if (line.length === 1) seg(line[0], line[0]);
    for (let i = 1; i < line.length; i++) seg(line[i - 1], line[i]);
  };
  switch (g.type) {
    case "MultiPoint":
      for (const c of g.coordinates) seg(c, c);
      break;
    case "LineString":
      walkLine(g.coordinates);
      break;
    case "MultiLineString":
    case "Polygon":
      for (const l of g.coordinates) walkLine(l);
      break;
    case "MultiPolygon":
      for (const poly of g.coordinates) for (const l of poly) walkLine(l);
      break;
  }
  return best;
}

export function withinMunich(p: LonLat, padDeg = 0.02): boolean {
  return inBBox(p, [MUNICH_BBOX.minLon, MUNICH_BBOX.minLat, MUNICH_BBOX.maxLon, MUNICH_BBOX.maxLat], padDeg);
}

/** Parse "48°05'51.0\"N" style coordinates (used in P+R CSVs) or plain decimals. */
export function parseCoordinate(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim().replace(",", ".");
  if (!s) return undefined;
  const dec = Number(s);
  if (Number.isFinite(dec)) return dec;
  const m = /^(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*['′]?\s*(\d+(?:\.\d+)?)?\s*(?:["″]|'')?\s*([NSEWO])?$/i.exec(s);
  if (!m) return undefined;
  let val = Number(m[1]) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600;
  if (m[4] && /[SW]/i.test(m[4])) val = -val;
  return val;
}

/** Round geometry coordinates to ~1 m to keep UI payloads small. */
export function roundGeometry<T extends GeoFeature["geometry"]>(g: T, digits = 5): T {
  if (!g) return g;
  const f = 10 ** digits;
  const walk = (c: any): any => (typeof c[0] === "number" ? [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f] : c.map(walk));
  return { ...g, coordinates: walk(g.coordinates) } as T;
}

export function fmtDistance(m: number): string {
  if (!Number.isFinite(m)) return "?";
  if (m === 0) return "inside";
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

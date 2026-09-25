import { diskCached, DAY } from "./cache.js";
import { geometryBBox, type GeoFeature } from "./geo.js";
import { fetchJson } from "./http.js";
import { fixMojibake } from "./text.js";

/**
 * Loader for GeoPortal München WFS layers (GeoServer). Layers are small
 * (a few MB at most), so we keep them in memory with per-feature bboxes and
 * refresh from disk cache / network on a schedule.
 */

export interface Layer {
  typeName: string;
  features: GeoFeature[];
  fetchedAt: number;
}

const layers = new Map<string, Layer>();
const loading = new Map<string, Promise<Layer>>();

function wfsUrl(typeName: string): string {
  const ws = typeName.split(":")[0];
  const q = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
  });
  return `https://geoportal.muenchen.de/geoserver/${ws}/ows?${q}`;
}

async function fetchLayer(typeName: string): Promise<GeoFeature[]> {
  const fc = await fetchJson<{ features: GeoFeature[] }>(wfsUrl(typeName), { timeoutMs: 90_000, retries: 2 });
  if (!Array.isArray(fc.features)) throw new Error(`WFS ${typeName}: no features array`);
  return fc.features.map((f) => ({ type: "Feature", id: f.id, geometry: f.geometry, properties: f.properties ?? {} }));
}

/** Some layers carry double-encoded umlauts ("GroÃŸer Stadtbach"): repair them. */
function cleanProps(p: Record<string, any>): Record<string, any> {
  for (const [k, v] of Object.entries(p)) if (typeof v === "string") p[k] = fixMojibake(v);
  return p;
}

export async function getLayer(typeName: string, maxAgeMs = DAY): Promise<Layer> {
  const cur = layers.get(typeName);
  if (cur && Date.now() - cur.fetchedAt < maxAgeMs) return cur;
  let p = loading.get(typeName);
  if (!p) {
    p = (async () => {
      const { value, fetchedAt } = await diskCached(`wfs_${typeName}`, maxAgeMs, () => fetchLayer(typeName));
      const layer: Layer = {
        typeName,
        fetchedAt,
        features: value.map((f) => ({ ...f, properties: cleanProps(f.properties), bbox: geometryBBox(f.geometry) })),
      };
      layers.set(typeName, layer);
      return layer;
    })().finally(() => loading.delete(typeName));
    loading.set(typeName, p);
  }
  try {
    return await p;
  } catch (err) {
    if (cur) return cur; // serve stale in-memory copy
    throw err;
  }
}

export function layerLoaded(typeName: string): boolean {
  return layers.has(typeName);
}

/** WMS GetFeatureInfo at a point, for layers only published as WMS. */
export async function featureInfo(layer: string, lon: number, lat: number, featureCount = 5): Promise<Record<string, any>[]> {
  const d = 0.0005;
  const q = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetFeatureInfo",
    layers: layer,
    query_layers: layer,
    styles: "",
    crs: "CRS:84",
    bbox: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    width: "101",
    height: "101",
    i: "50",
    j: "50",
    info_format: "application/json",
    feature_count: String(featureCount),
  });
  const res = await fetchJson<{ features?: { properties: Record<string, any> }[] }>(
    `https://geoportal.muenchen.de/geoserver/wms?${q}`,
    { timeoutMs: 15_000 },
  );
  return (res.features ?? []).map((f) => f.properties);
}

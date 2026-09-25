import Papa from "papaparse";
import { diskCached, DAY } from "./cache.js";
import { fetchJson, fetchText } from "./http.js";

/** Helpers for the CKAN open data portal https://opendata.muenchen.de */

const CKAN = "https://opendata.muenchen.de/api/3/action";

export interface CkanResource {
  id: string;
  name?: string;
  url: string;
  format?: string;
  last_modified?: string | null;
  created?: string;
}

export interface CkanPackage {
  id: string;
  name: string;
  title: string;
  notes?: string;
  metadata_modified?: string;
  metadata_created?: string;
  license_id?: string;
  organization?: { name: string; title: string };
  resources: CkanResource[];
}

export async function packageShow(name: string): Promise<CkanPackage> {
  const r = await fetchJson<{ success: boolean; result: CkanPackage }>(`${CKAN}/package_show?id=${encodeURIComponent(name)}`);
  if (!r.success) throw new Error(`CKAN package_show failed for ${name}`);
  return r.result;
}

export async function packageSearch(params: Record<string, string | number>): Promise<{ count: number; results: CkanPackage[] }> {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const r = await fetchJson<{ success: boolean; result: { count: number; results: CkanPackage[] } }>(`${CKAN}/package_search?${q}`, { timeoutMs: 30_000 });
  return r.result;
}

/** Newest resource of a dataset matching a format (resources are often re-published per year). */
export function newestResource(pkg: CkanPackage, format = "CSV", nameFilter?: RegExp): CkanResource | undefined {
  return pkg.resources
    .filter((r) => (r.format ?? "").toUpperCase() === format.toUpperCase() && (!nameFilter || nameFilter.test(`${r.name ?? ""} ${r.url}`)))
    .sort((a, b) => String(b.last_modified ?? b.created ?? "").localeCompare(String(a.last_modified ?? a.created ?? "")))[0];
}

export function parseCsv(text: string): Record<string, string>[] {
  const sample = text.slice(0, 5000);
  const delimiter = (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ";" : ",";
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  return res.data;
}

/** Download (and disk-cache) the newest CSV of a dataset as row objects. */
export async function datasetCsv(
  datasetName: string,
  opts: { maxAgeMs?: number; nameFilter?: RegExp } = {},
): Promise<{ rows: Record<string, string>[]; fetchedAt: number; resourceUrl: string; title: string }> {
  const { value, fetchedAt } = await diskCached(`csv_${datasetName}`, opts.maxAgeMs ?? DAY, async () => {
    const pkg = await packageShow(datasetName);
    const res = newestResource(pkg, "CSV", opts.nameFilter);
    if (!res) throw new Error(`No CSV resource in dataset ${datasetName}`);
    const text = await fetchText(res.url, { timeoutMs: 60_000 });
    return { rows: parseCsv(text), resourceUrl: res.url, title: pkg.title };
  });
  return { ...value, fetchedAt };
}

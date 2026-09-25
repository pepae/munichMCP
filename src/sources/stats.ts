import MiniSearch from "minisearch";
import { datasetCsv, packageSearch } from "../lib/ckan.js";
import { diskCached, DAY } from "../lib/cache.js";
import { cite, type Citation } from "../lib/sources.js";
import { fold, processTerm } from "../lib/text.js";

/**
 * Official statistics of the Statistisches Amt München: the Indikatorenatlas
 * (indicators per Stadtbezirk and year) and the Monatszahlen (monthly city-level
 * series), all dl-de/by-2.0 CSVs on the open data portal.
 */

export interface StatDataset {
  name: string;
  title: string;
  kind: "indikatorenatlas" | "monatszahlen" | "other";
  modified?: string;
  notes?: string;
}

let catalog: { list: StatDataset[]; index: MiniSearch; fetchedAt: number } | undefined;

export async function statCatalog() {
  if (catalog && Date.now() - catalog.fetchedAt < DAY) return catalog;
  const { value, fetchedAt } = await diskCached("stats_catalog", 7 * DAY, async () => {
    const r = await packageSearch({ fq: "organization:statistisches-amt", rows: 1000 });
    return r.results.map((p) => ({
      name: p.name,
      title: p.title,
      kind: (p.title.startsWith("Indikatorenatlas") ? "indikatorenatlas" : p.name.startsWith("monatszahlen") ? "monatszahlen" : "other") as StatDataset["kind"],
      modified: p.metadata_modified?.slice(0, 10),
      notes: (p.notes ?? "").replace(/\s+/g, " ").slice(0, 300),
    }));
  });
  const index = new MiniSearch<StatDataset & { id: number }>({
    fields: ["title", "notes"],
    storeFields: [],
    processTerm: (t) => processTerm(t),
    searchOptions: { boost: { title: 4 }, prefix: true, fuzzy: 0.2, combineWith: "AND" },
  });
  index.addAll(value.map((d, id) => ({ ...d, id })));
  catalog = { list: value, index, fetchedAt };
  return catalog;
}

export async function findStatistics(query: string, limit = 12): Promise<{ items: StatDataset[]; citation: Citation }> {
  const c = await statCatalog();
  let hits = c.index.search(query).map((r) => c.list[Number(r.id)]);
  if (!hits.length) hits = c.index.search(query, { combineWith: "OR" }).map((r) => c.list[Number(r.id)]);
  return { items: hits.slice(0, limit), citation: cite("stats", c.fetchedAt) };
}

export interface DistrictValue {
  code: string;
  name: string;
  value: number | null;
  /** Base values the indicator is computed from (e.g. population, area). */
  bases?: { name: string; value: number | null }[];
}

const num = (v?: string) => (v === undefined || v === "" || v === "NA" ? null : Number(v));

function splitRaum(raum: string): { code: string; name: string } {
  const m = /^(\d{2})\s+(.+)$/.exec(raum.trim());
  return m ? { code: m[1], name: m[2].replace(/\s+-\s+/g, "-") } : { code: "00", name: raum.trim() };
}

/** Match "5", "05", "Au-Haidhausen", "au haidhausen" to a district code. */
export function matchDistrict(input: string, units: { code: string; name: string }[]): string | undefined {
  const t = input.trim();
  if (/^\d{1,2}$/.test(t)) return t.padStart(2, "0");
  const key = fold(t).replace(/[^a-z]/g, "");
  const exact = units.find((u) => fold(u.name).replace(/[^a-z]/g, "") === key);
  if (exact) return exact.code;
  const partial = units.find((u) => fold(u.name).replace(/[^a-z]/g, "").includes(key) || key.includes(fold(u.name).replace(/[^a-z]/g, "")));
  return partial?.code;
}

export async function indicator(
  dataset: string,
  opts: { variant?: string; year?: number; district?: string } = {},
): Promise<{
  title: string;
  indicator: string;
  variant: string;
  variants: string[];
  year: number;
  years: number[];
  unit_hint?: string;
  city?: number | null;
  districts: DistrictValue[];
  series?: { year: number; value: number | null }[];
  district?: { code: string; name: string };
  resource_url: string;
  citation: Citation;
}> {
  const { rows, fetchedAt, resourceUrl, title } = await datasetCsv(dataset, { maxAgeMs: 7 * DAY });
  if (!rows.length || !("Indikatorwert" in rows[0])) throw new Error(`${dataset} is not an Indikatorenatlas dataset`);
  const variants = [...new Set(rows.map((r) => r["Ausprägung"]))];
  const variant = (opts.variant && variants.find((v) => fold(v) === fold(opts.variant!))) ?? variants.find((v) => /insgesamt/i.test(v)) ?? variants[0];
  const pool = rows.filter((r) => r["Ausprägung"] === variant);
  const years = [...new Set(pool.map((r) => Number(r.Jahr)))].sort((a, b) => a - b);
  const year = opts.year && years.includes(opts.year) ? opts.year : years.at(-1)!;
  const bases = (r: Record<string, string>) =>
    [1, 2, 3, 4, 5]
      .filter((i) => r[`Name Basiswert ${i}`])
      .map((i) => ({ name: r[`Name Basiswert ${i}`], value: num(r[`Basiswert ${i}`]) }));
  const inYear = pool.filter((r) => Number(r.Jahr) === year).map((r) => ({ ...splitRaum(r.Raumbezug), value: num(r.Indikatorwert), bases: bases(r) }));
  const units = inYear.filter((u) => u.code !== "00");
  const code = opts.district ? matchDistrict(opts.district, units) : undefined;
  const series = code
    ? pool
        .filter((r) => splitRaum(r.Raumbezug).code === code)
        .map((r) => ({ year: Number(r.Jahr), value: num(r.Indikatorwert) }))
        .sort((a, b) => a.year - b.year)
    : undefined;
  return {
    title,
    indicator: rows[0].Indikator,
    variant,
    variants,
    year,
    years,
    unit_hint: rows[0]["Name Basiswert 1"] ? `ratio of "${rows[0]["Name Basiswert 1"]}"${rows[0]["Name Basiswert 2"] ? ` to "${rows[0]["Name Basiswert 2"]}"` : ""}` : undefined,
    city: inYear.find((u) => u.code === "00")?.value,
    districts: units.sort((a, b) => a.code.localeCompare(b.code)),
    series,
    district: code ? units.find((u) => u.code === code) ?? { code, name: code } : undefined,
    resource_url: resourceUrl,
    citation: { ...cite("stats", fetchedAt), url: `https://opendata.muenchen.de/dataset/${dataset}` },
  };
}

export async function monthly(
  dataset: string,
  opts: { series?: string; variant?: string } = {},
): Promise<{
  title: string;
  series: string;
  variant: string;
  options: { series: string[]; variants: string[] };
  months: { month: string; value: number | null; change_vs_prev_year_pct: number | null }[];
  years: { year: number; total: number | null }[];
  citation: Citation;
}> {
  const { rows, fetchedAt, title } = await datasetCsv(dataset, { maxAgeMs: 7 * DAY });
  if (!rows.length || !("MONATSZAHL" in rows[0])) throw new Error(`${dataset} is not a Monatszahlen dataset`);
  const allSeries = [...new Set(rows.map((r) => r.MONATSZAHL))];
  const series = (opts.series && allSeries.find((s) => fold(s).includes(fold(opts.series!)))) ?? allSeries[0];
  const variants = [...new Set(rows.filter((r) => r.MONATSZAHL === series).map((r) => r.AUSPRAEGUNG))];
  const variant = (opts.variant && variants.find((v) => fold(v).includes(fold(opts.variant!)))) ?? variants.find((v) => /insgesamt/i.test(v)) ?? variants[0];
  const pool = rows.filter((r) => r.MONATSZAHL === series && r.AUSPRAEGUNG === variant);
  const months = pool
    .filter((r) => /^\d{6}$/.test(r.MONAT) && num(r.WERT) !== null)
    .sort((a, b) => a.MONAT.localeCompare(b.MONAT))
    .slice(-24)
    .map((r) => ({ month: `${r.MONAT.slice(0, 4)}-${r.MONAT.slice(4)}`, value: num(r.WERT), change_vs_prev_year_pct: num(r.VERAEND_VORJAHRESMONAT_PROZENT) }));
  const years = pool
    .filter((r) => r.MONAT === "Summe")
    .map((r) => ({ year: Number(r.JAHR), total: num(r.WERT) }))
    .sort((a, b) => a.year - b.year)
    .slice(-12);
  return { title, series, variant, options: { series: allSeries, variants }, months, years, citation: { ...cite("stats", fetchedAt), url: `https://opendata.muenchen.de/dataset/${dataset}` } };
}

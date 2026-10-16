import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { containsPoint } from "../lib/geo.js";
import { getLayer } from "../lib/wfs.js";
import { ADDRESS_LAYERS } from "../sources/address.js";
import { findStatistics, indicator, monthly, statCatalog } from "../sources/stats.js";
import { locate } from "./common.js";
import { citationsMd, defineTool } from "./util.js";

export function registerStatsTools(server: McpServer) {
  defineTool(
    server,
    "find_statistics",
    {
      title: "Find official Munich statistics",
      description:
        "Search the ~100 official statistics datasets of the Statistisches Amt München: the Indikatorenatlas (indicators per city district and year, e.g. population density, " +
        "average age, share of single households, unemployment, car ownership, childcare places, doctor density, building permits) and the Monatszahlen (monthly city series, " +
        "e.g. traffic accidents, tourism, weather, population, Oktoberfest). Returns dataset ids for district_stats. Search in German (e.g. 'Arbeitslose', 'Einpersonenhaushalte', 'Unfälle').",
      input: z.object({ query: z.string().min(2).max(120), limit: z.number().int().min(1).max(30).default(10) }),
    },
    async ({ query, limit }) => {
      const r = await findStatistics(query, limit);
      return {
        text:
          `${r.items.length} statistics dataset(s) for "${query}":\n` +
          r.items.map((d) => `- ${d.name} (${d.kind}${d.modified ? `, updated ${d.modified}` : ""}): ${d.title}`).join("\n") +
          "\n\nUse district_stats with the dataset id." +
          citationsMd([r.citation]),
        data: { query, datasets: r.items },
      };
    },
  );

  defineTool(
    server,
    "district_stats",
    {
      title: "Official statistics by district",
      description:
        "Values of an official Munich statistics dataset (id from find_statistics). For Indikatorenatlas datasets: the indicator for all 25 Stadtbezirke and the city in a year " +
        "(default: latest), optionally with the time series of one district (give district as number, name, or an address). For Monatszahlen datasets: the last 24 months and yearly totals. Shows a bar chart.",
      input: z.object({
        dataset: z.string().min(3).max(160),
        district: z.string().max(120).optional().describe("District number or name (e.g. '05', 'Au-Haidhausen'), or leave empty"),
        address: z.string().max(200).optional().describe("Alternatively an address; its district is used"),
        year: z.number().int().min(1990).max(2100).optional(),
        variant: z.string().max(80).optional().describe("Ausprägung, e.g. 'insgesamt', 'deutsch', 'nichtdeutsch'"),
        series: z.string().max(80).optional().describe("For Monatszahlen: which series, e.g. 'Verkehrsunfälle'"),
      }),
      ui: true,
    },
    async (a) => {
      const cat = await statCatalog();
      const ds = cat.list.find((d) => d.name === a.dataset) ?? (await findStatistics(a.dataset, 1)).items[0];
      if (!ds) throw new Error(`Unknown statistics dataset "${a.dataset}". Use find_statistics first.`);
      let district = a.district;
      if (!district && a.address) {
        const loc = await locate({ address: a.address });
        const layer = await getLayer(ADDRESS_LAYERS.district);
        district = layer.features.find((f) => containsPoint(f, loc))?.properties.sb_nummer;
      }
      if (ds.kind === "monatszahlen") {
        const m = await monthly(ds.name, { series: a.series, variant: a.variant });
        const last = m.months.at(-1);
        return {
          text:
            `${m.title}: ${m.series} (${m.variant}), City of Munich.\n` +
            `Latest month ${last?.month}: ${last?.value ?? "n/a"}${last?.change_vs_prev_year_pct !== null && last?.change_vs_prev_year_pct !== undefined ? ` (${last.change_vs_prev_year_pct > 0 ? "+" : ""}${last.change_vs_prev_year_pct} % vs. same month last year)` : ""}.\n` +
            `Yearly totals: ${m.years.map((y) => `${y.year}: ${y.total ?? "n/a"}`).join(", ")}\n` +
            `Last months: ${m.months.slice(-12).map((x) => `${x.month}: ${x.value}`).join(", ")}\n` +
            `Other series in this dataset: ${m.options.series.join(", ")}; variants: ${m.options.variants.join(", ")}` +
            citationsMd([m.citation]),
          data: m as unknown as Record<string, unknown>,
          view: {
            kind: "bars",
            title: `${m.series} (${m.variant})`,
            subtitle: `${m.title}, yearly totals`,
            rows: m.years.map((y) => ({ label: String(y.year), value: y.total ?? 0 })),
            attribution: "Statistisches Amt München (dl-de/by-2.0)",
          },
        };
      }
      if (ds.kind !== "indikatorenatlas") throw new Error(`${ds.name} is not a supported statistics dataset (use an Indikatorenatlas or Monatszahlen dataset).`);
      const r = await indicator(ds.name, { variant: a.variant, year: a.year, district });
      const sorted = [...r.districts].sort((x, y) => (y.value ?? -Infinity) - (x.value ?? -Infinity));
      const rank = r.district ? sorted.findIndex((d) => d.code === r.district!.code) + 1 : 0;
      const text =
        `${r.indicator} (${r.variant}), ${r.year}. City of Munich: ${r.city ?? "n/a"}.` +
        (r.district ? `\n${r.district.code} ${r.district.name}: ${r.districts.find((d) => d.code === r.district!.code)?.value ?? "n/a"} (rank ${rank} of ${r.districts.length})` : "") +
        (r.series ? `\nTime series ${r.district?.name}: ${r.series.map((s) => `${s.year}: ${s.value}`).join(", ")}` : "") +
        `\n\nAll districts ${r.year}:\n${r.districts.map((d) => `${d.code} ${d.name}: ${d.value ?? "n/a"}`).join("\n")}` +
        `\n\nVariants: ${r.variants.join(", ")}. Years: ${r.years[0]}-${r.years.at(-1)}.${r.unit_hint ? ` Definition: ${r.unit_hint}.` : ""}` +
        citationsMd([r.citation]);
      return {
        text,
        data: r as unknown as Record<string, unknown>,
        view: {
          kind: "bars",
          title: `${r.indicator} (${r.variant}), ${r.year}`,
          subtitle: `Munich: ${r.city ?? "n/a"}, 25 districts${r.district ? `, highlighted: ${r.district.name}` : ""}`,
          rows: sorted.map((d) => ({ label: `${d.code} ${d.name}`, value: d.value ?? 0, display: d.value === null ? "n/a" : String(d.value), highlight: d.code === r.district?.code })),
          note: r.unit_hint ? `Definition: ${r.unit_hint}` : undefined,
          attribution: "Statistisches Amt München, Indikatorenatlas (dl-de/by-2.0)",
        },
      };
    },
  );
}

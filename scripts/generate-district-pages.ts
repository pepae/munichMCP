/**
 * Generate one wiki page per Stadtbezirk from open data (deterministic, re-runnable):
 *   npx tsx scripts/generate-district-pages.ts [outDir=wiki]
 * Figures: Indikatorenatlas (Statistisches Amt), facility counts by point-in-polygon
 * over the city's open datasets, resident-parking areas from the Mobilitätsreferat.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { containsPoint, representativePoint, type GeoFeature } from "../src/lib/geo.js";
import { getLayer } from "../src/lib/wfs.js";
import { normalizeSlug } from "../src/sources/wiki.js";
import { ADDRESS_LAYERS } from "../src/sources/address.js";
import { CATEGORIES } from "../src/sources/places.js";
import { indicator } from "../src/sources/stats.js";

const outDir = path.resolve(process.argv[2] ?? "wiki");
const today = new Date().toISOString().slice(0, 10);

const INDICATORS = [
  { id: "indikatorenatlas-bevoelkerung-bevoelkerungsdichte-83r65mct", label: "Population density (residents per km²)", fmt: (v: number) => v.toLocaleString("en") },
  { id: "indikatorenatlas-bevoelkerung-durchschnittsalter-83r65mct", label: "Average age (years)", fmt: (v: number) => v.toFixed(1) },
  { id: "indikatorenatlas-bevoelkerung-einpersonenhaushalte-83r65mct", label: "Single-person households (% of households)", fmt: (v: number) => v.toFixed(1) },
  { id: "indikatorenatlas-bevoelkerung-nichtdeutsche-83r65mct", label: "Residents without German citizenship (%)", fmt: (v: number) => v.toFixed(1) },
  { id: "indikatorenatlas-verkehr-motorisierungsgrad-personenkraftwagen-83r65mct", label: "Cars per 1,000 residents", fmt: (v: number) => v.toFixed(0) },
];

const FACILITIES = ["kita", "playground", "library", "drinking_fountain", "public_toilet", "glass_container", "recycling_center", "swimming_pool", "market", "ev_charging", "senior_center", "social_center"];

async function main() {
  const districts = await getLayer(ADDRESS_LAYERS.district);
  const byCode = new Map<string, { name: string; features: GeoFeature[] }>();
  for (const f of districts.features) {
    const code = String(f.properties.sb_nummer).padStart(2, "0");
    const cur = byCode.get(code) ?? { name: String(f.properties.sb_name), features: [] };
    cur.features.push(f);
    byCode.set(code, cur);
  }
  const inDistrict = (code: string, p: { lat: number; lon: number }) => byCode.get(code)!.features.some((f) => containsPoint(f, p));

  const stats = await Promise.all(INDICATORS.map((i) => indicator(i.id).then((r) => ({ ...i, r }))));
  const density = stats[0].r;
  const facilities = await Promise.all(FACILITIES.map(async (id) => ({ cat: CATEGORIES.find((c) => c.id === id)!, items: (await CATEGORIES.find((c) => c.id === id)!.load()).items })));
  const prm = await getLayer(ADDRESS_LAYERS.residentParking);

  const codes = [...byCode.keys()].sort();
  await fs.mkdir(path.join(outDir, "entities", "stadtbezirke"), { recursive: true });
  const listLines: string[] = [];

  for (const code of codes) {
    const d = byCode.get(code)!;
    const name = d.name;
    const slug = `entities/stadtbezirke/${code}-${normalizeSlug(name)}`;
    listLines.push(`| ${code} | [[${slug}|${name}]] | ${(density.districts.find((x) => x.code === code)?.bases?.[0]?.value ?? 0).toLocaleString("en")} |`);
    const ds = density.districts.find((x) => x.code === code);
    const pop = ds?.bases?.find((b) => /bevölkerung/i.test(b.name))?.value;
    const area = ds?.bases?.find((b) => /fläche/i.test(b.name))?.value;

    const statRows = stats
      .map((s) => {
        const v = s.r.districts.find((x) => x.code === code)?.value;
        const sorted = [...s.r.districts].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
        const rank = sorted.findIndex((x) => x.code === code) + 1;
        return `| ${s.label} | ${v === null || v === undefined ? "n/a" : s.fmt(v)} | ${s.r.city === null || s.r.city === undefined ? "n/a" : s.fmt(s.r.city)} | ${rank} of 25 |`;
      })
      .join("\n");

    const facRows = facilities
      .map(({ cat, items }) => `| ${cat.label} | ${items.filter((p) => inDistrict(code, p)).length} |`)
      .join("\n");

    const parking = prm.features
      .filter((f) => {
        const c = representativePoint(f);
        return c && inDistrict(code, c) && String(f.properties.status ?? "").includes("Betrieb");
      })
      .map((f) => String(f.properties.name))
      .sort();

    const body = `# Stadtbezirk ${code}: ${name}

${name} is Munich's city district (Stadtbezirk) no. ${Number(code)}${pop ? `, home to ${pop.toLocaleString("en")} registered main residents` : ""}${area ? ` on ${area.toLocaleString("en")} km²` : ""} (Statistisches Amt München, ${density.year}). Its local council is the [[entities/bezirksausschuesse|Bezirksausschuss]] ${Number(code)} (BA ${Number(code)}), which files motions to the city (see [[entities/stadtrat]]).

## Key figures (${density.year})

| Indicator | ${name} | Munich | Rank (highest = 1) |
|---|---|---|---|
${statRows}

Source: Indikatorenatlas of the Statistisches Amt München. Ask munichMCP \`district_stats\` for other indicators or time series.

## Public facilities in the district

Counted by location from the city's open datasets (${today}):

| Facility | Count |
|---|---|
${facRows}

Use \`find_nearby\` with an address for the nearest ones.

## Resident parking

${parking.length ? `Resident-parking licence areas (Parklizenzgebiete) in operation in this district: ${parking.join(", ")}. Residents without private parking can apply for a permit; see [[topics/bewohnerparken]].` : "No resident-parking licence area (Parklizenzgebiet) in operation has its centre in this district; see [[topics/bewohnerparken]]."}

## See also

- [[entities/stadtbezirke|All 25 districts]]
- [[topics/milieuschutz]] (whether an address is in a Milieuschutz area: \`address_report\`)
- [[topics/mietspiegel]]
`;
    const fm = [
      "---",
      `title: "Stadtbezirk ${code}: ${name}"`,
      "type: entity",
      `summary: "District ${Number(code)} of Munich: key statistics, public facilities and resident-parking areas from open data."`,
      "tags: [stadtbezirk, statistik]",
      "sources:",
      "  - https://opendata.muenchen.de/organization/statistisches-amt",
      "  - https://opendata.muenchen.de/dataset/vablock_stadtbezirke_opendata",
      "  - https://opendata.muenchen.de/dataset/opendata_ruhver_prm_gebiete_poly",
      "  - https://opendata.muenchen.de",
      `updated: ${today}`,
      "updated_by: generate-district-pages",
      "---",
      "",
    ].join("\n");
    await fs.writeFile(path.join(outDir, `${slug}.md`), fm + body, "utf8");
  }

  const overview = `---
title: "Munich's 25 city districts (Stadtbezirke)"
type: entity
summary: "List of Munich's 25 Stadtbezirke with population, and how districts and their committees work."
tags: [stadtbezirk]
sources:
  - https://opendata.muenchen.de/dataset/vablock_stadtbezirke_opendata
  - https://opendata.muenchen.de/organization/statistisches-amt
updated: ${today}
updated_by: generate-district-pages
---

# Munich's 25 city districts

Munich is divided into 25 city districts (*Stadtbezirke*), each subdivided into *Stadtbezirksteile* and *Stadtbezirksviertel*. Every district elects a district committee, the [[entities/bezirksausschuesse|Bezirksausschuss]] (BA), with the same number as the district. \`address_report\` tells you the district, Bezirksteil and Viertel of any address.

| No. | District | Registered main residents (${density.year}) |
|---|---|---|
${listLines.join("\n")}

City total: ${(density.city !== undefined && density.city !== null ? "" : "")}${stats[0].r.districts.reduce((a, d) => a + (d.bases?.[0]?.value ?? 0), 0).toLocaleString("en")} residents in the 25 districts (sum of the district figures).

Sources: district boundaries from the GeoPortal München; population from the Indikatorenatlas (Statistisches Amt München, dl-de/by-2.0).
`;
  await fs.writeFile(path.join(outDir, "entities", "stadtbezirke.md"), overview, "utf8");
  console.log(`wrote ${codes.length} district pages + entities/stadtbezirke.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

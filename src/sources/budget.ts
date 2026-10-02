import { DAY } from "../lib/cache.js";
import { datasetCsv } from "../lib/ckan.js";
import { cite, type Citation } from "../lib/sources.js";
import { fold } from "../lib/text.js";

/**
 * The City of Munich's budget results (Stadtkämmerei, dl-de/by-2.0): ordinary
 * income and expenses of every product (about 200 public services, from fire
 * protection to childcare) per department and year, 2018 onwards. Plus the
 * resident population (Statistisches Amt) to express costs per resident.
 */

const DATASET = "ordentliche-ertraege-und-aufwendungen-produkte-der-lhm";

export interface BudgetRow {
  product: string;
  department: string;
  year: number;
  income: number;
  expense: number;
}

const int = (v?: string) => {
  const n = Number(String(v ?? "").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export async function loadBudget(): Promise<{ rows: BudgetRow[]; years: number[]; fetchedAt: number; resourceUrl: string }> {
  const { rows, fetchedAt, resourceUrl } = await datasetCsv(DATASET, { maxAgeMs: 7 * DAY });
  const out = rows
    .filter((r) => r.produkt && r.jahr)
    .map((r) => ({
      product: r.produkt.replace(/\s+/g, " ").trim(),
      department: (r.referat ?? "").replace(/\s+/g, " ").trim(),
      year: Number(r.jahr),
      income: int(r["ordentliche ertraege rechnungsergebnis"]),
      expense: int(r["ordentliche aufwendungen rechnungsergebnis"]),
    }));
  const years = [...new Set(out.map((r) => r.year))].sort((a, b) => a - b);
  return { rows: out, years, fetchedAt, resourceUrl };
}

/** Residents with main residence at the end of each year (Statistisches Amt, Monatszahlen). */
export async function populationByYear(): Promise<Map<number, number>> {
  const { rows } = await datasetCsv("monatszahlen-bevoelkerung", { maxAgeMs: 7 * DAY });
  const m = new Map<number, number>();
  for (const r of rows) {
    if (r.MONATSZAHL === "Geschlecht und Staatsangehörigkeit" && r.AUSPRAEGUNG === "insgesamt" && /^\d{4}12$/.test(r.MONAT)) m.set(Number(r.JAHR), Number(r.WERT));
  }
  return m;
}

/** English (and colloquial German) words mapped to stems used in the city's product names. */
const SYNONYMS: Record<string, string[]> = {
  fire: ["brandschutz", "feuerwehr", "rettungsdienst"],
  firefighters: ["brandschutz"],
  ambulance: ["rettungsdienst"],
  feuerwehr: ["brandschutz", "feuerwehr"],
  childcare: ["tageseinrichtungen fuer kinder", "kindertages", "kindertagespflege"],
  daycare: ["tageseinrichtungen fuer kinder", "kindertages", "kindertagespflege"],
  kindergarten: ["tageseinrichtungen fuer kinder", "kindertages"],
  kita: ["tageseinrichtungen fuer kinder", "kindertages", "kindertagespflege"],
  kitas: ["tageseinrichtungen fuer kinder", "kindertages", "kindertagespflege"],
  school: ["schul"],
  schools: ["schul"],
  library: ["bibliothek"],
  libraries: ["bibliothek"],
  museum: ["museum", "museen"],
  museums: ["museum", "museen"],
  theatre: ["theater", "kammerspiele"],
  theater: ["theater", "kammerspiele"],
  roads: ["verkehrsflaechen", "strassen"],
  streets: ["verkehrsflaechen", "strassen"],
  parks: ["gruen", "freiflaechen"],
  green: ["gruen", "freiflaechen"],
  housing: ["wohn"],
  homeless: ["wohnungslos", "unterbringung"],
  refugees: ["fluecht", "gefluecht", "asyl", "unterbringung"],
  culture: ["kultur"],
  sport: ["sport", "baeder"],
  sports: ["sport", "baeder"],
  cemetery: ["friedhof", "bestattung"],
  cemeteries: ["friedhof", "bestattung"],
  health: ["gesundheit"],
  youth: ["jugend"],
  elderly: ["alter", "senior"],
  pension: ["grundsicherung im alter"],
  welfare: ["sozialhilfe", "grundsicherung", "hilfe zum lebensunterhalt"],
  unemployment: ["arbeit", "grundsicherung fuer arbeitsuchende"],
  it: ["informations", "it-"],
  digital: ["informations", "digital"],
  climate: ["klima", "umwelt"],
  environment: ["umwelt"],
  fountains: ["brunnen"],
  bridges: ["ingenieurbauwerke", "bruecken"],
  traffic: ["verkehr"],
  parking: ["parkraum", "ruhender verkehr", "verkehrsueberwachung"],
  cycling: ["radverkehr", "rad"],
  "public transport": ["oepnv", "nahverkehr"],
  mvg: ["oepnv", "nahverkehr"],
  taxes: ["steuern"],
  tax: ["steuern"],
  debt: ["schulden", "zinsen", "finanz"],
  staff: ["personal"],
  personnel: ["personal"],
  elections: ["wahlen"],
  registry: ["standesamt", "standesaemter"],
  marriage: ["standesamt", "standesaemter"],
  "citizens office": ["buergerbuero", "einwohner", "melde"],
  "vehicle registration": ["kfz", "zulassung"],
  events: ["veranstaltung", "oktoberfest", "wiesn"],
  oktoberfest: ["veranstaltung", "wiesn", "oktoberfest"],
  wiesn: ["veranstaltung", "wiesn", "oktoberfest"],
  markets: ["markt", "maerkte"],
  tourism: ["tourismus"],
  economy: ["wirtschaft"],
  planning: ["stadtplanung", "bauordnung", "stadtentwicklung"],
  building: ["bauordnung", "hochbau", "gebaeude"],
  property: ["grundstueck", "immobilien", "liegenschaften"],
  waste: ["abfall", "reinigung"],
  cleaning: ["reinigung"],
  water: ["gewaesser", "wasser"],
};

function terms(query: string): string[][] {
  const q = fold(query).trim();
  // Whole-phrase synonyms first ("public transport"), then single words.
  for (const [k, v] of Object.entries(SYNONYMS)) if (k.includes(" ") && q === k) return [v];
  return q
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 2 && !["der", "die", "das", "und", "the", "of", "for", "city", "munich", "muenchen", "spending", "cost", "costs", "budget", "how", "much"].includes(w))
    .map((w) => [w, ...(SYNONYMS[w] ?? [])]);
}

export function matchProducts(rows: BudgetRow[], query: string): string[] {
  const ts = terms(query);
  if (!ts.length) return [];
  const products = [...new Map(rows.map((r) => [r.product, r])).values()];
  const hay = (r: BudgetRow) => fold(`${r.product} ${r.department}`);
  const all = products.filter((r) => ts.every((alts) => alts.some((a) => hay(r).includes(a))));
  const any = all.length ? all : products.filter((r) => ts.some((alts) => alts.some((a) => hay(r).includes(a))));
  return any.map((r) => r.product);
}

export function matchDepartment(rows: BudgetRow[], input: string): string | undefined {
  const deps = [...new Set(rows.map((r) => r.department))];
  const k = fold(input).replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    rbs: "Referat für Bildung und Sport",
    education: "Referat für Bildung und Sport",
    kvr: "Kreisverwaltungsreferat",
    social: "Sozialreferat",
    treasury: "Stadtkämmerei",
    finance: "Stadtkämmerei",
    culture: "Kulturreferat",
    health: "Gesundheitsreferat",
    mobility: "Mobilitätsreferat",
    planning: "Referat für Stadtplanung und Bauordnung",
    plan: "Referat für Stadtplanung und Bauordnung",
    rku: "Referat für Klima und Umweltschutz",
    climate: "Referat für Klima und Umweltschutz",
    raw: "Referat für Arbeit und Wirtschaft",
    economy: "Referat für Arbeit und Wirtschaft",
    construction: "Baureferat",
    it: "IT-Referat",
    hr: "Personal- und Organisationsreferat",
    por: "Personal- und Organisationsreferat",
    property: "Kommunalreferat",
    mayor: "Direktorium",
    audit: "Revisionsamt",
  };
  if (aliases[k]) return deps.find((d) => d === aliases[k]);
  return deps.find((d) => fold(d).replace(/[^a-z]/g, "") === k) ?? deps.find((d) => fold(d).replace(/[^a-z]/g, "").includes(k));
}

export function budgetCitation(fetchedAt: number): Citation {
  return cite("budget", fetchedAt);
}

import spec from "../data/mietspiegel-2025.json" with { type: "json" };
import type { Citation } from "../lib/sources.js";
import { cite } from "../lib/sources.js";

/**
 * Deterministic implementation of the "Mietspiegel für München 2025"
 * (qualified rent index, § 558d BGB). Tables and rules were extracted from the
 * official brochure/calculator and verified against the official calculation
 * service (see data/mietspiegel-2025.json, "verification").
 *
 * Arithmetic is exact: money in integer milli-euros, area in milli-m², and a
 * single HALF_UP (away from zero) rounding per output value, like the official
 * calculator.
 *
 * The Wohnlage (residential location class) is NOT looked up automatically:
 * the city's Wohnlage map service requires a separate agreement for automated
 * use. The user reads it from the official map (deep link provided).
 */

type Opt = { id: string; calculatorId: number; surcharge: { cents: number }; allowedYearClasses?: number[]; label: string };

export const WOHNLAGEN = spec.wohnlage.options.map((o) => ({ id: o.id, label: o.label, central: o.central, cents: o.surcharge.cents, definition: o.definitionEn }));
export type WohnlageId = "durchschnittlich" | "gut" | "beste" | "zentral_durchschnittlich" | "zentral_gut" | "zentral_beste";
export const GEBAEUDETYPEN = spec.surcharges.gebaeudetyp.options as Opt[];
export const HAUSTYPEN = spec.surcharges.haustyp.options as Opt[];
export const FUSSBODEN = spec.surcharges.fussboden.options as Opt[];
export const SANITAER = spec.surcharges.sanitaer.features as { id: string; calculatorId: number; label: string; allowedYearClasses: number[] }[];
export const ELEKTRO = spec.surcharges.kueche.kuechenausstattung.appliances as { id: string; calculatorId: number; label: string }[];
export const BETRIEBSKOSTEN = spec.operatingCosts.items as { id: string; calculatorIndex: number; label: string; amount: { cents: number }; unit: string }[];
export const ABWEICHUNGEN = spec.justifiedDeviations.items as { id: string; number: number | string; label: string; min: { cents: number }; max: { cents: number }; allowedYearClasses: number[] }[];

export interface RentInput {
  wohnflaeche_qm: number;
  baujahr: number;
  wohnlage: WohnlageId;
  gebaeudetyp?: "hochhaus" | "wohnblock" | "anderer";
  haustyp?: "sehr_einfacher_altbau" | "einfacher_altbau" | "guter_altbau" | "einfacher_nachkriegsbau" | "anderer";
  unvollstaendige_beheizung?: boolean;
  fussbodenheizung?: boolean;
  sanitaer?: string[];
  offene_kueche?: boolean;
  kuechen_grundausstattung?: boolean;
  elektrogeraete?: string[];
  fussboden?: "ohne_fussbodenbelag" | "einfacher_boden" | "guter_boden" | "weder_noch";
  modernisierter_boden?: boolean;
  terrasse_balkon?: boolean;
  besondere_ausstattung?: boolean;
  modernisierte_fenster?: boolean;
  /** EUR per m², keys = justifiedDeviations ids. */
  begruendete_abweichungen?: Partial<Record<string, number>>;
  betriebskosten?: { mietart: "netto" | "brutto_oder_teilinklusiv"; in_miete_enthalten?: string[] };
}

export interface RentResult {
  year_class: string;
  area_row: string;
  grundpreis: number;
  surcharges: { label: string; eur_per_sqm: number }[];
  surcharge_sum: number;
  operating_costs_per_sqm: number;
  operating_costs_per_flat: number;
  central_range: boolean;
  average_per_sqm: number;
  average_monthly: number;
  range_per_sqm: { low: number; high: number };
  range_monthly: { low: number; high: number };
  justified_deviations_sum?: number;
  justified_deviations_capped?: number;
  with_justified_deviations_per_sqm?: number;
  with_justified_deviations_monthly?: number;
  assumptions: string[];
}

export class MietspiegelError extends Error {
  constructor(public problems: string[]) {
    super(`Input not valid for the Mietspiegel 2025: ${problems.join(" ")}`);
  }
}

/** Round n/d (integers, d > 0) to an integer, half away from zero. */
export function roundHalfAway(n: number, d: number): number {
  const s = n < 0 ? -1 : 1;
  const a = Math.abs(n);
  return s * Math.floor((2 * a + d) / (2 * d));
}

const eur = (cents: number) => Math.round(cents) / 100;

export function yearClassOf(year: number): number {
  const c = spec.yearClasses.find((y) => (y.fromYear === null || year >= y.fromYear) && year <= y.toYear);
  if (!c) throw new MietspiegelError([`Building year ${year} is not covered (the Mietspiegel 2025 covers buildings completed up to 2023).`]);
  return c.id;
}

const Y = spec.conflictRules.yearClassShorthand as Record<string, number[]>;

export function computeRent(input: RentInput): RentResult {
  const problems: string[] = [];
  const assumptions: string[] = [];
  const area = input.wohnflaeche_qm;
  if (!(area >= spec.applicability.livingArea.minSqm && area <= spec.applicability.livingArea.maxSqm)) {
    problems.push(`Living area must be between 20 and 160 m² (got ${area}).`);
  }
  const areaMilli = Math.round(area * 1000);
  const yc = yearClassOf(input.baujahr);
  const inYears = (allowed: number[] | undefined, what: string) => {
    if (allowed && !allowed.includes(yc)) problems.push(`${what} does not apply to buildings from ${spec.yearClasses[yc].label}.`);
  };

  // Grundpreis (Table 2)
  const n = Math.max(20, Math.ceil(area - 1e-9));
  const row = spec.baseRent.rows.find((r) => n >= r.areaFrom && n <= r.areaTo);
  if (!row && !problems.length) problems.push(`No Grundpreis row for ${area} m².`);
  const gCents = row ? Math.round(row.values[yc] * 100) : 0;

  // Surcharges and deductions (Table 3), in cents per m²
  const items: { label: string; cents: number }[] = [];
  const wl = spec.wohnlage.options.find((o) => o.id === input.wohnlage);
  if (!wl) problems.push(`Unknown Wohnlage "${input.wohnlage}".`);
  else items.push({ label: wl.label, cents: wl.surcharge.cents });

  const gt = GEBAEUDETYPEN.find((o) => o.id === (input.gebaeudetyp ?? "anderer"))!;
  if (!gt) problems.push(`Unknown Gebäudetyp "${input.gebaeudetyp}".`);
  else {
    if (gt.id === "hochhaus" && !Y["1949to1998"].includes(yc)) problems.push("A Hochhaus surcharge only applies to buildings from 1949 to 1998.");
    else inYears(gt.allowedYearClasses, gt.label);
    if (gt.surcharge.cents) items.push({ label: gt.label, cents: gt.surcharge.cents });
  }

  let haustypId = input.haustyp;
  if (!haustypId) {
    haustypId = yc <= 2 ? "einfacher_altbau" : "anderer";
    assumptions.push(
      yc <= 2
        ? "House type not given: assumed 'Einfacher Altbau' (pre-1949 building with either an unconverted attic and a style element, or a converted attic and no style element). Stucco, rooms over 2.90 m or a living room over 20 m² with a converted attic would make it 'Guter Altbau' (+0.36)."
        : "House type not given: assumed 'Anderer Haustyp' (for 1949-1977 buildings with an unconverted attic, 'Einfacher Nachkriegsbau' applies instead: -1.14).",
    );
  }
  const ht = HAUSTYPEN.find((o) => o.id === haustypId);
  if (!ht) problems.push(`Unknown Haustyp "${haustypId}".`);
  else {
    inYears(ht.allowedYearClasses, ht.label);
    if (ht.surcharge.cents) items.push({ label: ht.label, cents: ht.surcharge.cents });
  }

  const hz = spec.surcharges.heizung.features;
  if (input.unvollstaendige_beheizung) items.push({ label: hz[0].label, cents: hz[0].surcharge.cents });
  if (input.fussbodenheizung) {
    inYears(hz[1].allowedYearClasses, hz[1].label);
    items.push({ label: hz[1].label, cents: hz[1].surcharge.cents });
  }

  for (const id of new Set(input.sanitaer ?? [])) {
    const f = SANITAER.find((s) => s.id === id);
    if (!f) {
      problems.push(`Unknown bathroom feature "${id}".`);
      continue;
    }
    inYears(f.allowedYearClasses, f.label);
    items.push({ label: f.label, cents: spec.surcharges.sanitaer.perFeature.cents });
  }

  const k = spec.surcharges.kueche;
  if (input.offene_kueche) items.push({ label: k.offeneKueche.label, cents: k.offeneKueche.surcharge.cents });
  const appliances = [...new Set(input.elektrogeraete ?? [])];
  if (appliances.length && !input.kuechen_grundausstattung) problems.push("Kitchen appliance surcharges require a landlord-provided basic kitchen (sink and built-in cupboards).");
  for (const id of appliances) {
    const a = ELEKTRO.find((e) => e.id === id);
    if (!a) problems.push(`Unknown kitchen appliance "${id}".`);
    else items.push({ label: a.label, cents: k.kuechenausstattung.perAppliance.cents });
  }

  const fb = FUSSBODEN.find((o) => o.id === (input.fussboden ?? "weder_noch"));
  if (!fb) problems.push(`Unknown floor option "${input.fussboden}".`);
  else if (fb.surcharge.cents) items.push({ label: fb.label, cents: fb.surcharge.cents });
  if (!input.fussboden) assumptions.push("Floor not given: assumed neither 'einfacher' nor 'guter Boden' (0.00). Parquet/laminate/tiles in all living rooms would add +1.37.");
  const mb = spec.surcharges.fussboden.modernisierterBoden;
  if (input.modernisierter_boden) {
    inYears(mb.allowedYearClasses, mb.label);
    if (fb?.id === "ohne_fussbodenbelag") problems.push("'Modernisierter Boden' cannot be combined with 'Ohne Fußbodenbelag'.");
    items.push({ label: mb.label, cents: mb.surcharge.cents });
  }

  const tb = spec.surcharges.terrasseBalkon;
  if (input.terrasse_balkon) {
    inYears(tb.allowedYearClasses, "Terrasse/Balkon surcharge");
    items.push({ label: "Terrasse/Dachterrasse bzw. Balkon/Loggia", cents: tb.surcharge.cents });
  }
  const wm = spec.surcharges.weitereMerkmale.features;
  if (input.besondere_ausstattung) items.push({ label: wm[0].label, cents: wm[0].surcharge.cents });
  if (input.modernisierte_fenster) {
    inYears(wm[1].allowedYearClasses, wm[1].label);
    items.push({ label: wm[1].label, cents: wm[1].surcharge.cents });
  }

  // Operating costs (Table 1), only for gross / partially inclusive rents
  let bkSqmCents = 0;
  let bkFlatCents = 0;
  if (input.betriebskosten?.mietart === "brutto_oder_teilinklusiv") {
    for (const id of new Set(input.betriebskosten.in_miete_enthalten ?? [])) {
      const it = BETRIEBSKOSTEN.find((b) => b.id === id);
      if (!it) {
        problems.push(`Unknown operating cost item "${id}".`);
        continue;
      }
      if (it.unit.includes("flat")) bkFlatCents += it.amount.cents;
      else bkSqmCents += it.amount.cents;
    }
  }

  // Justified deviations (Table 5), entered in EUR/m² with up to 3 decimals
  let sMils = 0;
  let anyDeviation = false;
  for (const [id, raw] of Object.entries(input.begruendete_abweichungen ?? {})) {
    if (raw === undefined || raw === null || raw === 0) continue;
    const d = ABWEICHUNGEN.find((x) => x.id === id);
    if (!d) {
      problems.push(`Unknown justified deviation "${id}".`);
      continue;
    }
    const mils = Math.round(raw * 1000);
    if (mils < d.min.cents * 10 || mils > d.max.cents * 10) problems.push(`${d.label}: allowed range is ${eur(d.min.cents)} to ${eur(d.max.cents)} EUR/m².`);
    if (!d.allowedYearClasses.includes(yc)) problems.push(`${d.label} does not apply to buildings from ${spec.yearClasses[yc].label}.`);
    sMils += mils;
    anyDeviation = true;
  }
  const fa = input.begruendete_abweichungen?.fassade_besonders_gestaltet;
  const fbx = input.begruendete_abweichungen?.fassade_nicht_besonders_gestaltet;
  if (fa && fbx) problems.push("A facade can be either 'besonders gestaltet' or 'nicht besonders gestaltet', not both.");

  if (problems.length) throw new MietspiegelError(problems);

  const zCents = items.reduce((s, i) => s + i.cents, 0);
  const perSqmMils = (gCents + zCents + bkSqmCents) * 10;
  // monthly in micro-euros: mils/m² * milli-m² = 1e-6 EUR
  const monthlyMicro = perSqmMils * areaMilli + bkFlatCents * 10_000;
  const centsOfMicro = (micro: number) => roundHalfAway(micro, 10_000);
  const perSqmCentsOfMicro = (micro: number) => roundHalfAway(micro, areaMilli * 10);
  const central = Boolean(wl?.central);
  const rng = central ? spec.range.central : spec.range.nonCentral;
  const downMicro = rng.down.cents * 10 * areaMilli;
  const upMicro = rng.up.cents * 10 * areaMilli;

  const result: RentResult = {
    year_class: spec.yearClasses[yc].label,
    area_row: `${row!.areaFrom}-${row!.areaTo} m²`,
    grundpreis: eur(gCents),
    surcharges: items.map((i) => ({ label: i.label, eur_per_sqm: eur(i.cents) })),
    surcharge_sum: eur(zCents),
    operating_costs_per_sqm: eur(bkSqmCents),
    operating_costs_per_flat: eur(bkFlatCents),
    central_range: central,
    average_per_sqm: eur(perSqmCentsOfMicro(monthlyMicro)),
    average_monthly: eur(centsOfMicro(monthlyMicro)),
    range_per_sqm: { low: eur(perSqmCentsOfMicro(monthlyMicro + downMicro)), high: eur(perSqmCentsOfMicro(monthlyMicro + upMicro)) },
    range_monthly: { low: eur(centsOfMicro(monthlyMicro + downMicro)), high: eur(centsOfMicro(monthlyMicro + upMicro)) },
    assumptions,
  };
  if (anyDeviation) {
    const capped = Math.min(Math.max(sMils, rng.down.cents * 10), rng.up.cents * 10);
    const withMicro = monthlyMicro + capped * areaMilli;
    result.justified_deviations_sum = sMils / 1000;
    result.justified_deviations_capped = capped / 1000;
    result.with_justified_deviations_per_sqm = eur(perSqmCentsOfMicro(withMicro));
    result.with_justified_deviations_monthly = eur(centsOfMicro(withMicro));
  }
  return result;
}

/** Deep link to the official Wohnlage map for an address (the user reads the colour there). */
export function wohnlageMapUrl(address?: string): string {
  return address ? `https://geoportal-karten-2025.muenchen.de/mietspiegel_wohnlage?query=${encodeURIComponent(address)}` : "https://2025.mietspiegel-muenchen.de/berechnung.html";
}

export function mietspiegelCitation(): Citation {
  return cite("mietspiegel", Date.parse(spec.compiledOn));
}

export const MIETSPIEGEL_META = {
  validFrom: spec.legal.validFrom,
  dataPeriod: spec.legal.dataPeriod,
  officialCalculator: "https://2025.mietspiegel-muenchen.de/",
  brochure: spec.sources.brochure.url,
};

/**
 * Wohnlage lookup for address reports. Intentionally disabled: automated use of
 * the Sozialreferat's Wohnlage map service requires an agreement with the city.
 */
export async function wohnlageAt(_at: { lat: number; lon: number }): Promise<{ label: string; category: string; note?: string; citation: Citation } | undefined> {
  return undefined;
}

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { BETRIEBSKOSTEN, computeRent, MIETSPIEGEL_META, mietspiegelCitation, MietspiegelError, WOHNLAGEN, wohnlageMapUrl, type RentInput, type WohnlageId } from "../sources/mietspiegel.js";
import { citationsMd, defineTool } from "./util.js";

const WL_IDS = ["durchschnittlich", "gut", "beste", "zentral_durchschnittlich", "zentral_gut", "zentral_beste"] as const;
const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const input = z.object({
  address: z.string().max(200).optional().describe("Address of the flat (used for the link to the official Wohnlage map)"),
  living_area_m2: z.number().min(20).max(160).describe("Living area in m² (Mietspiegel covers 20-160 m²)"),
  year_built: z.number().int().min(1500).max(2023).describe("Year the building was completed (up to 2023)"),
  wohnlage: z
    .enum(WL_IDS)
    .optional()
    .describe("Residential location class from the official Wohnlagenkarte. If unknown, leave empty: all six classes are computed and a link to the official map is returned."),
  building_type: z.enum(["hochhaus", "wohnblock", "anderer"]).default("anderer").describe("hochhaus = 1949-1998 building with at least ground floor + 6 storeys; wohnblock = block without elevator with larger green area and at most ground floor + 5; otherwise anderer"),
  house_type: z
    .enum(["sehr_einfacher_altbau", "einfacher_altbau", "guter_altbau", "einfacher_nachkriegsbau", "anderer"])
    .optional()
    .describe("Pre-1949: sehr_einfacher/einfacher/guter_altbau depending on attic conversion and style elements (stucco, rooms > 2.90 m, largest room > 20 m²). 1949-1977 with unconverted attic: einfacher_nachkriegsbau. Else anderer."),
  floor: z.enum(["ohne_fussbodenbelag", "einfacher_boden", "guter_boden", "weder_noch"]).optional().describe("guter_boden = parquet/laminate/wooden boards/stone/tiles in every living room; einfacher_boden = mostly carpet or PVC"),
  floor_modernised: z.boolean().default(false).describe("All living-room floors modernised by the landlord in 2019 or later (building before 2019)"),
  incomplete_heating: z.boolean().default(false).describe("At least one living room without landlord-provided heating"),
  underfloor_heating: z.boolean().default(false).describe("Underfloor heating (building before 1999)"),
  bath_extra_equipment: z.boolean().default(false).describe("Bathtub plus separate shower plus second washbasin and/or bidet"),
  bath_towel_radiator: z.boolean().default(false).describe("Towel radiator (not electric)"),
  bath_walk_in_shower: z.boolean().default(false).describe("Separate floor-level shower"),
  bath_large_or_second: z.boolean().default(false).describe("Largest bathroom at least 6 m² and/or a second bathroom"),
  bath_modernised: z.boolean().default(false).describe("Bathroom modernised in 2019 or later (building before 1999)"),
  open_kitchen: z.boolean().default(false),
  kitchen_basic_equipment: z.boolean().default(false).describe("Landlord-provided sink and built-in cupboards (required for appliance surcharges)"),
  kitchen_hob: z.boolean().default(false).describe("Ceramic or induction hob provided by the landlord"),
  kitchen_fridge: z.boolean().default(false),
  kitchen_dishwasher: z.boolean().default(false),
  balcony_or_terrace: z.boolean().default(false).describe("Balcony, loggia or terrace of at least 1 m² (building before 1999)"),
  special_equipment: z.boolean().default(false).describe("Electric roller shutters/blinds or a video intercom"),
  windows_modernised: z.boolean().default(false).describe("Pre-1949 building: all windows from 1995 or later and at least half modernised in 2019 or later"),
  rent_type: z.enum(["net", "gross"]).default("net").describe("net = Nettokaltmiete; gross = some operating costs are included in the rent"),
  included_operating_costs: z.array(z.enum(BETRIEBSKOSTEN.map((b) => b.id) as [string, ...string[]])).optional().describe("For gross rents: operating cost types included in the rent"),
  justified_deviations: z
    .object({
      warmwasser: z.number().min(-0.7).max(0).optional(),
      rueckgebaeude: z.number().min(0).max(0.7).optional(),
      waermedaemmung_aussenwaende: z.number().min(0).max(0.9).optional(),
      fassade_besonders_gestaltet: z.number().min(0).max(0.4).optional(),
      fassade_nicht_besonders_gestaltet: z.number().min(-0.25).max(0).optional(),
      zusaetzliche_begruendungen: z.number().min(-4.5).max(4).optional(),
    })
    .optional()
    .describe("Optional Table 5 deviations in EUR/m²"),
  current_rent_eur: z.number().min(0).max(20000).optional().describe("Current or asked monthly rent (net unless rent_type = gross), to compare against the index"),
});

type Args = z.infer<typeof input>;

function toRentInput(a: Args, wohnlage: WohnlageId): RentInput {
  return {
    wohnflaeche_qm: a.living_area_m2,
    baujahr: a.year_built,
    wohnlage,
    gebaeudetyp: a.building_type,
    haustyp: a.house_type,
    fussboden: a.floor,
    modernisierter_boden: a.floor_modernised,
    unvollstaendige_beheizung: a.incomplete_heating,
    fussbodenheizung: a.underfloor_heating,
    sanitaer: [
      a.bath_extra_equipment && "besondere_zusatzausstattung_bad",
      a.bath_towel_radiator && "handtuchheizkoerper",
      a.bath_walk_in_shower && "separate_bodengleiche_dusche",
      a.bath_large_or_second && "bad_mind_6qm_oder_zweites_bad",
      a.bath_modernised && "modernisiertes_bad",
    ].filter(Boolean) as string[],
    offene_kueche: a.open_kitchen,
    kuechen_grundausstattung: a.kitchen_basic_equipment,
    elektrogeraete: [a.kitchen_hob && "glaskeramik_oder_induktionskochfeld", a.kitchen_fridge && "kuehlschrank", a.kitchen_dishwasher && "geschirrspuelmaschine"].filter(Boolean) as string[],
    terrasse_balkon: a.balcony_or_terrace,
    besondere_ausstattung: a.special_equipment,
    modernisierte_fenster: a.windows_modernised,
    begruendete_abweichungen: a.justified_deviations,
    betriebskosten: a.rent_type === "gross" ? { mietart: "brutto_oder_teilinklusiv", in_miete_enthalten: a.included_operating_costs ?? [] } : { mietart: "netto" },
  };
}

const FIELDS = [
  { name: "living_area_m2", label: "Living area (m²)", type: "number", min: 20, max: 160, step: 0.5, group: "Flat" },
  { name: "year_built", label: "Year built", type: "number", min: 1800, max: 2023, step: 1, group: "Flat" },
  { name: "current_rent_eur", label: "Current rent €/month (optional)", type: "number", min: 0, step: 10, group: "Flat" },
  { name: "wohnlage", label: "Wohnlage (official map)", type: "select", group: "Flat", options: WOHNLAGEN.map((w) => ({ value: w.id, label: w.label })) },
  { name: "building_type", label: "Building type", type: "select", group: "Building", options: [{ value: "anderer", label: "Other" }, { value: "wohnblock", label: "Wohnblock" }, { value: "hochhaus", label: "Hochhaus (1949-1998, E+6)" }] },
  { name: "house_type", label: "House type", type: "select", group: "Building", options: [{ value: "anderer", label: "Other (post-1948)" }, { value: "einfacher_nachkriegsbau", label: "Einfacher Nachkriegsbau" }, { value: "sehr_einfacher_altbau", label: "Sehr einfacher Altbau" }, { value: "einfacher_altbau", label: "Einfacher Altbau" }, { value: "guter_altbau", label: "Guter Altbau" }] },
  { name: "floor", label: "Floor (living rooms)", type: "select", group: "Building", options: [{ value: "weder_noch", label: "Mixed / neither" }, { value: "guter_boden", label: "Parquet, laminate, tiles, stone" }, { value: "einfacher_boden", label: "Mostly carpet or PVC" }, { value: "ohne_fussbodenbelag", label: "No floor covering" }] },
  ...[
    ["balcony_or_terrace", "Balcony / terrace (pre-1999)"],
    ["open_kitchen", "Open kitchen"],
    ["kitchen_basic_equipment", "Kitchen: sink + cupboards"],
    ["kitchen_hob", "Ceramic/induction hob"],
    ["kitchen_fridge", "Fridge"],
    ["kitchen_dishwasher", "Dishwasher"],
    ["bath_towel_radiator", "Towel radiator"],
    ["bath_walk_in_shower", "Walk-in shower"],
    ["bath_large_or_second", "Bath ≥ 6 m² or second bath"],
    ["bath_extra_equipment", "Tub + shower + 2nd basin/bidet"],
    ["bath_modernised", "Bath modernised 2019+ (pre-1999)"],
    ["floor_modernised", "Floors modernised 2019+"],
    ["underfloor_heating", "Underfloor heating (pre-1999)"],
    ["incomplete_heating", "A living room without heating"],
    ["special_equipment", "Electric shutters or video intercom"],
    ["windows_modernised", "Windows modernised (pre-1949)"],
  ].map(([name, label]) => ({ name, label, type: "checkbox", group: "Equipment" })),
];

export function registerRentTools(server: McpServer) {
  if (process.env.MIETSPIEGEL_ENABLED === "0") return;
  defineTool(
    server,
    "estimate_rent",
    {
      title: "Mietspiegel 2025 rent check",
      description:
        "Compute the local comparative rent (ortsübliche Vergleichsmiete) for a Munich flat exactly like the official Mietspiegel für München 2025 calculator: base price by size and building year, " +
        "surcharges/deductions for location class (Wohnlage), building and house type, bathroom, kitchen, floor, heating, balcony, windows, optional operating costs and justified deviations; " +
        "returns the average per m² and per month plus the official two-thirds range, and compares an asked rent. If the Wohnlage is unknown, all six classes are computed and a link to the official Wohnlage map is given. Shows an interactive calculator.",
      input,
      ui: true,
      invoking: "Applying the Mietspiegel 2025…",
    },
    async (a) => {
      const citation = mietspiegelCitation();
      const mapUrl = wohnlageMapUrl(a.address);
      if (!a.wohnlage) {
        const rows = WOHNLAGEN.map((w) => {
          try {
            const r = computeRent(toRentInput(a, w.id as WohnlageId));
            return { w, r };
          } catch (e) {
            if (e instanceof MietspiegelError) throw e;
            throw e;
          }
        });
        const text =
          `Mietspiegel 2025 estimate for ${a.living_area_m2} m², built ${a.year_built}${a.address ? `, ${a.address}` : ""}. The residential location class (Wohnlage) was not given, so here are all six classes:\n\n` +
          rows.map(({ w, r }) => `- ${w.label}: ${fmt(r.average_per_sqm)} €/m², ${fmt(r.average_monthly)} €/month (range ${fmt(r.range_monthly.low)} to ${fmt(r.range_monthly.high)} €)`).join("\n") +
          `\n\nLook up the Wohnlage of the address on the official map: ${mapUrl} (read the colour at the marker), then call estimate_rent again with wohnlage set.` +
          (rows[0].r.assumptions.length ? `\n\nAssumptions: ${rows[0].r.assumptions.join(" ")}` : "") +
          `\n\nUnofficial calculation following the published method; not legal advice. Official calculator: ${MIETSPIEGEL_META.officialCalculator}` +
          citationsMd([citation]);
        return {
          text,
          data: { input: a, wohnlage_map: mapUrl, by_wohnlage: rows.map(({ w, r }) => ({ wohnlage: w.id, label: w.label, ...r })) },
          view: {
            kind: "form",
            title: "Mietspiegel 2025 rent check",
            subtitle: `${a.living_area_m2} m², built ${a.year_built}. Pick the Wohnlage from the official map to refine.`,
            tool: "estimate_rent",
            fields: FIELDS,
            values: { ...a, wohnlage: "durchschnittlich" },
            result: { headline: "Average local rent by Wohnlage (€/month)", lines: rows.map(({ w, r }) => `${w.label}: ${fmt(r.average_monthly)} € (${fmt(r.average_per_sqm)} €/m²)`), tone: "good" },
            attribution: "Unofficial calculation after the Mietspiegel für München 2025 (Landeshauptstadt München, Sozialreferat). Not legal advice.",
          },
        };
      }
      const r = computeRent(toRentInput(a, a.wohnlage));
      const lines = [
        `Mietspiegel 2025 for ${a.living_area_m2} m², built ${a.year_built} (${r.year_class}), ${WOHNLAGEN.find((w) => w.id === a.wohnlage)!.label}${a.address ? `, ${a.address}` : ""}:`,
        `Average local comparative rent: ${fmt(r.average_per_sqm)} €/m², ${fmt(r.average_monthly)} €/month${a.rent_type === "gross" ? " (including the selected operating costs)" : " (net, without operating costs)"}.`,
        `Official range (two thirds of comparable rents): ${fmt(r.range_per_sqm.low)} to ${fmt(r.range_per_sqm.high)} €/m², i.e. ${fmt(r.range_monthly.low)} to ${fmt(r.range_monthly.high)} €/month.`,
      ];
      if (r.with_justified_deviations_monthly !== undefined)
        lines.push(`With justified deviations (${fmt(r.justified_deviations_sum!)} €/m², capped to ${fmt(r.justified_deviations_capped!)}): ${fmt(r.with_justified_deviations_per_sqm!)} €/m², ${fmt(r.with_justified_deviations_monthly)} €/month.`);
      lines.push(`Breakdown: Grundpreis ${fmt(r.grundpreis)} €/m² (row ${r.area_row}, ${r.year_class})${r.surcharges.map((s) => `; ${s.label} ${s.eur_per_sqm > 0 ? "+" : ""}${fmt(s.eur_per_sqm)}`).join("")}${r.operating_costs_per_sqm ? `; operating costs +${fmt(r.operating_costs_per_sqm)}` : ""}${r.operating_costs_per_flat ? `; per-flat operating costs +${fmt(r.operating_costs_per_flat)} €/month` : ""}.`);
      let tone: "good" | "warn" | "bad" = "good";
      let comparison: Record<string, unknown> | undefined;
      if (a.current_rent_eur !== undefined) {
        const d = Math.round((a.current_rent_eur - r.average_monthly) * 100) / 100;
        comparison = {
          your_rent_eur: a.current_rent_eur,
          difference_to_average_eur: d,
          difference_to_average_pct: Math.round((d / r.average_monthly) * 1000) / 10,
          position: a.current_rent_eur > r.range_monthly.high ? "above_range" : a.current_rent_eur < r.range_monthly.low ? "below_range" : d > 0 ? "within_range_above_average" : "within_range_at_or_below_average",
          above_upper_range_by_eur: a.current_rent_eur > r.range_monthly.high ? Math.round((a.current_rent_eur - r.range_monthly.high) * 100) / 100 : 0,
          mietpreisbremse_note: d / r.average_monthly > 0.1 ? "More than 10 % above the comparative rent: relevant where the Mietpreisbremse (§ 556d BGB) applies to a new lease; exceptions exist." : undefined,
        };
        const diff = a.current_rent_eur - r.average_monthly;
        const pct = (diff / r.average_monthly) * 100;
        if (a.current_rent_eur > r.range_monthly.high) tone = "bad";
        else if (diff > 0) tone = "warn";
        lines.push(
          `Your rent ${fmt(a.current_rent_eur)} € is ${diff >= 0 ? `${fmt(diff)} € (${pct.toFixed(1)} %) above` : `${fmt(-diff)} € (${(-pct).toFixed(1)} %) below`} the average` +
            `${a.current_rent_eur > r.range_monthly.high ? " and above the upper end of the official range" : a.current_rent_eur < r.range_monthly.low ? " and below the lower end of the range" : ", within the official range"}.` +
            (pct > 10 ? " Note: where the Mietpreisbremse applies (§ 556d BGB), a new lease may generally not exceed the local comparative rent by more than 10 %, with exceptions (e.g. first letting after comprehensive modernisation, new builds, a higher previous rent). Check with a tenants' association or lawyer." : ""),
        );
      }
      if (r.assumptions.length) lines.push(`Assumptions: ${r.assumptions.join(" ")}`);
      lines.push(`Wohnlage map for checking the class: ${mapUrl}`, `Unofficial calculation following the published method (verified against the official calculator); not legal advice. Official calculator: ${MIETSPIEGEL_META.officialCalculator}`);
      return {
        text: lines.join("\n") + citationsMd([citation]),
        data: { input: a, result: r, comparison, wohnlage_map: mapUrl, sources: [citation] },
        view: {
          kind: "form",
          title: "Mietspiegel 2025 rent check",
          subtitle: `${WOHNLAGEN.find((w) => w.id === a.wohnlage)!.label} · ${r.year_class} · row ${r.area_row}`,
          tool: "estimate_rent",
          fields: FIELDS,
          values: a,
          result: {
            headline: "Average local comparative rent",
            big: `${fmt(r.average_monthly)} € / month`,
            range: `${fmt(r.average_per_sqm)} €/m² · range ${fmt(r.range_monthly.low)} to ${fmt(r.range_monthly.high)} €`,
            lines: a.current_rent_eur !== undefined ? [lines.find((l) => l.startsWith("Your rent"))!.split(". Note:")[0]] : [],
            tone,
          },
          breakdown: [
            { label: `Grundpreis (row ${r.area_row}, ${r.year_class})`, value: `${fmt(r.grundpreis)} €/m²` },
            ...r.surcharges.map((s) => ({ label: s.label, value: `${s.eur_per_sqm > 0 ? "+" : ""}${fmt(s.eur_per_sqm)} €/m²` })),
            ...(r.operating_costs_per_sqm ? [{ label: "Operating costs included", value: `+${fmt(r.operating_costs_per_sqm)} €/m²` }] : []),
            { label: "Average", value: `${fmt(r.average_per_sqm)} €/m²` },
          ],
          attribution: "Unofficial calculation after the Mietspiegel für München 2025 (Landeshauptstadt München, Sozialreferat). Not legal advice.",
        },
      };
    },
  );
}

import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/mietspiegel-test-cases.json" with { type: "json" };
import { computeRent, MietspiegelError, roundHalfAway, type RentInput } from "../src/sources/mietspiegel.js";

/**
 * The fixtures were verified against the official calculation service of the
 * City of Munich (2025.mietspiegel-muenchen.de) on 2026-09-25.
 */

function toInput(i: any): RentInput {
  return {
    wohnflaeche_qm: i.wohnflaeche_qm,
    baujahr: i.baujahr,
    wohnlage: i.wohnlage,
    gebaeudetyp: i.gebaeudetyp,
    haustyp: i.haustyp,
    unvollstaendige_beheizung: i.unvollstaendige_beheizung,
    fussbodenheizung: i.fussbodenheizung,
    sanitaer: i.sanitaer,
    offene_kueche: i.offene_kueche,
    kuechen_grundausstattung: i.kuechen_grundausstattung,
    elektrogeraete: i.elektrogeraete,
    fussboden: i.fussboden,
    modernisierter_boden: i.modernisierter_boden,
    terrasse_balkon: i.terrasse_balkon,
    besondere_ausstattung: i.besondere_ausstattung,
    modernisierte_fenster: i.modernisierte_fenster,
    begruendete_abweichungen: i.begruendete_abweichungen,
    betriebskosten: i.betriebskosten,
  };
}

describe("Mietspiegel 2025: verified official cases", () => {
  for (const c of (fixtures as any).cases) {
    it(c.id, () => {
      const r = computeRent(toInput(c.input));
      const e = c.expected;
      expect(r.average_per_sqm).toBe(e.averagePerSqm);
      expect(r.average_monthly).toBe(e.averageMonthly);
      expect(r.range_per_sqm).toEqual(e.rangePerSqm);
      expect(r.range_monthly).toEqual(e.rangeMonthly);
      if (r.with_justified_deviations_per_sqm !== undefined) {
        expect(r.with_justified_deviations_per_sqm).toBe(e.withJustifiedDeviationsPerSqm);
        expect(r.with_justified_deviations_monthly).toBe(e.withJustifiedDeviationsMonthly);
      }
    });
  }
});

describe("Mietspiegel 2025: Grundpreis grid (770 official responses)", () => {
  const g = (fixtures as any).grid;
  const col = (name: string) => g.columns.indexOf(name);
  const HAUSTYP = ["sehr_einfacher_altbau", "einfacher_altbau", "guter_altbau", "einfacher_nachkriegsbau", "anderer"];
  const YEAR_OF_CLASS = [1900, 1925, 1940, 1960, 1970, 1980, 1995, 2005, 2015, 2020, 2023];
  it("matches every cell", () => {
    let checked = 0;
    for (const row of g.rows) {
      const r = computeRent({
        wohnflaeche_qm: Number(row[col("area")]),
        baujahr: YEAR_OF_CLASS[row[col("yearClass")]],
        wohnlage: "durchschnittlich",
        gebaeudetyp: "anderer",
        haustyp: HAUSTYP[row[col("haustypCalculatorId")]] as RentInput["haustyp"],
        fussboden: "weder_noch",
      });
      // The grid baseline uses the Haustyp surcharge of its row; compare the monthly totals.
      expect(r.average_monthly).toBe(row[col("averageMonthly")]);
      expect(r.range_monthly.low).toBe(row[col("lowMonthly")]);
      expect(r.range_monthly.high).toBe(row[col("highMonthly")]);
      checked++;
    }
    expect(checked).toBe(770);
  });
});

describe("Mietspiegel 2025: rules", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfAway(-125, 10)).toBe(-13);
    expect(roundHalfAway(125, 10)).toBe(13);
    expect(roundHalfAway(124, 10)).toBe(12);
  });
  it("rejects out-of-scope input", () => {
    expect(() => computeRent({ wohnflaeche_qm: 15, baujahr: 1990, wohnlage: "gut" })).toThrow(MietspiegelError);
    expect(() => computeRent({ wohnflaeche_qm: 60, baujahr: 2024, wohnlage: "gut" })).toThrow(MietspiegelError);
    expect(() => computeRent({ wohnflaeche_qm: 60, baujahr: 2005, wohnlage: "gut", gebaeudetyp: "hochhaus" })).toThrow(/Hochhaus/);
    expect(() => computeRent({ wohnflaeche_qm: 60, baujahr: 2005, wohnlage: "gut", elektrogeraete: ["kuehlschrank"] })).toThrow(/basic kitchen/);
  });
});

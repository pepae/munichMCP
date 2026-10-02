import { describe, expect, it } from "vitest";
import { matchDepartment, matchProducts, type BudgetRow } from "../src/sources/budget.js";
import { parseResults } from "../src/sources/elections.js";
import { bandLabel, parseGfiText } from "../src/sources/risks.js";
import { nameMatches } from "../src/sources/transit.js";
import { withoutSources } from "../src/tools/util.js";

describe("LfU GetFeatureInfo text", () => {
  it("parses a noise value", () => {
    const t = "@aggroadlden2022 Classify.Pixel Value;\r\n\t\t\t\t\tClassify.Class value;\r\n\t\t\t\t\t 75.199997;\r\n\t\t\t\t\t\t4;\r\n\t\t\t\t\t\t ";
    expect(parseGfiText(t)).toEqual([{ "Classify.Pixel Value": "75.199997", "Classify.Class value": "4" }]);
  });
  it("keeps empty values aligned with their names", () => {
    const t = "@festsetzung Gewässername;\r\n\t\t\t\t\tStatus;\r\n\t\t\t\t\tAmtsblatt6;\r\n\t\t\t\t\tShape;\r\n\t\t\t\t\t Isar;\r\n\t\t\t\t\t\tfestgesetzt;\r\n\t\t\t\t\t\t;\r\n\t\t\t\t\t\tPolygon;\r\n\t\t\t\t\t\t ";
    expect(parseGfiText(t)).toEqual([{ Gewässername: "Isar", Status: "festgesetzt", Amtsblatt6: "", Shape: "Polygon" }]);
  });
  it("does not split on @ inside values", () => {
    const t = "@layer Kontakt;\r\n\t Name;\r\n\t poststelle@wwa-m.bayern.de;\r\n\t WWA;\r\n\t ";
    expect(parseGfiText(t)).toEqual([{ Kontakt: "poststelle@wwa-m.bayern.de", Name: "WWA" }]);
  });
  it("labels noise bands", () => {
    expect(bandLabel(70, "Lden")).toBe("70-74 dB(A)");
    expect(bandLabel(75, "Lden")).toBe("75 dB(A) or more");
    expect(bandLabel(70, "Lnight")).toBe("70 dB(A) or more");
  });
});

describe("election CSV", () => {
  it("parses fixed columns and party triplets", () => {
    const csv =
      "Datum;Gebietsnummer;Typ;Wahlberechtigte;A1;A2;A3;Waehler;Briefwaehler;Ungueltige;Partei;Anzahl;Prozent;Partei;Anzahl;Prozent\n" +
      "08.03.2026;01;1;40.000;0;0;0;20.000;9.000;100;CSU;5.000;25,00000 %;GRÜNE;6.000;30,00000 %\n";
    const [r] = parseResults(csv);
    expect(r.code).toBe("01");
    expect(r.type).toBe("1");
    expect(r.row.turnout_pct).toBe(50);
    expect(r.row.parties.map((p) => p.party)).toEqual(["GRÜNE", "CSU"]);
    expect(r.row.parties[0]).toEqual({ party: "GRÜNE", votes: 6000, pct: 30 });
  });
});

describe("budget matching", () => {
  const rows: BudgetRow[] = [
    { product: "Brandschutz", department: "Kreisverwaltungsreferat", year: 2024, income: 1, expense: 2 },
    { product: "Betrieb und Steuerung städtischer Tageseinrichtungen für Kinder", department: "Referat für Bildung und Sport", year: 2024, income: 1, expense: 2 },
    { product: "Münchner Stadtbibliothek", department: "Kulturreferat", year: 2024, income: 1, expense: 2 },
  ];
  it("maps English terms to German product names", () => {
    expect(matchProducts(rows, "fire brigade")).toEqual(["Brandschutz"]);
    expect(matchProducts(rows, "childcare")).toEqual(["Betrieb und Steuerung städtischer Tageseinrichtungen für Kinder"]);
    expect(matchProducts(rows, "libraries")).toEqual(["Münchner Stadtbibliothek"]);
  });
  it("resolves department aliases", () => {
    expect(matchDepartment(rows, "RBS")).toBe("Referat für Bildung und Sport");
    expect(matchDepartment(rows, "kulturreferat")).toBe("Kulturreferat");
  });
});

describe("transit and tool helpers", () => {
  it("matches station names loosely", () => {
    expect(nameMatches("Hauptbahnhof", "Hauptbahnhof (U, Tram)")).toBe(true);
    expect(nameMatches("Ostbahnhof", "München, Ostbahnhof")).toBe(true);
    expect(nameMatches("Sendlinger Tor", "Sendlinger Tor")).toBe(true);
    expect(nameMatches("Odeonsplatz", "Marienplatz")).toBe(false);
  });
  it("strips the sources block from summaries", () => {
    expect(withoutSources("Answer.\n\nSources:\n- A (x; y) url")).toBe("Answer.");
    expect(withoutSources("No sources here")).toBe("No sources here");
  });
});

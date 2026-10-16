import { describe, expect, it } from "vitest";
import { catalog, catalogErrors, fillTemplate } from "../src/catalog/catalog.js";
import { looksLikeSecret } from "../src/catalog/proposals.js";
import { SOURCES } from "../src/lib/sources.js";
import { CATEGORIES } from "../src/sources/places.js";

describe("source catalog", () => {
  it("loads every manifest without errors", () => {
    expect(catalogErrors).toEqual([]);
    expect(catalog.length).toBeGreaterThan(25);
  });
  it("covers every built-in source exactly once", () => {
    const covered = catalog.flatMap((m) => (m.implementation.kind === "code" ? [m.implementation.source_id] : []));
    expect(new Set(covered)).toEqual(new Set(Object.keys(SOURCES)));
  });
  it("registers YAML-only sources as nearby categories", () => {
    const ids = CATEGORIES.map((c) => c.id);
    for (const m of catalog) if (m.implementation.kind !== "code") expect(ids).toContain(m.implementation.category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("fills field templates", () => {
    expect(fillTemplate("Ratschbankerl {standort}", { standort: "Nußbaumpark" })).toBe("Ratschbankerl Nußbaumpark");
    expect(fillTemplate("latitude", { latitude: "48.1" })).toBe("48.1");
    expect(fillTemplate("missing", {})).toBeUndefined();
  });
});

describe("proposals", () => {
  it("rejects anything that looks like a credential", () => {
    expect(looksLikeSecret("api_key=abcdef1234567890")).toBe(true);
    expect(looksLikeSecret("token: ghp_abcdefghijklmnop1234")).toBe(true);
    expect(looksLikeSecret("Parking garages with live occupancy, see https://example.org/a/very/long/path/with/many/segments/and/ids/1234567890")).toBe(false);
  });
});

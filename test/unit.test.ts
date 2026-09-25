import { describe, expect, it } from "vitest";
import { containsPoint, distanceToFeature, geometryBBox, haversine, parseCoordinate, type GeoFeature } from "../src/lib/geo.js";
import { parseAddress, streetKey, streetPrefix } from "../src/lib/geocode.js";
import { cistem, fixMojibake, fold, processTerm, stripHtml } from "../src/lib/text.js";
import { parseFeed } from "../src/sources/wiki-collector.js";
import { extractLinks, normalizeSlug, parseFrontmatter } from "../src/sources/wiki.js";

describe("address parsing", () => {
  it("splits street, number and suffix", () => {
    expect(parseAddress("Lindwurmstr. 50a, 80337 München")).toEqual({ street: "Lindwurmstr.", number: 50, suffix: "a" });
    expect(parseAddress("Rosenheimer Straße 5")).toEqual({ street: "Rosenheimer Straße", number: 5, suffix: undefined });
    expect(parseAddress("Tal 12-14")).toEqual({ street: "Tal", number: 12, suffix: undefined });
    expect(parseAddress("Odeonsplatz")).toEqual({ street: "Odeonsplatz" });
    expect(parseAddress("Straße des 17. Juni 3").number).toBe(3);
  });
  it("normalises street names for matching", () => {
    expect(streetPrefix("Lindwurmstraße")).toBe("Lindwurmstr");
    expect(streetPrefix("Rosenheimer Str.")).toBe("Rosenheimer str");
    expect(streetKey("Lindwurmstraße")).toBe(streetKey("Lindwurmstr."));
    expect(streetKey("Odeonsplatz")).not.toBe(streetKey("Platzl"));
    expect(streetKey("Müllerstraße")).toBe("muellerstr");
  });
});

describe("geo", () => {
  const square: GeoFeature = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [[[11.5, 48.1], [11.6, 48.1], [11.6, 48.2], [11.5, 48.2], [11.5, 48.1]]] },
  };
  square.bbox = geometryBBox(square.geometry);
  it("point in polygon and distances", () => {
    expect(containsPoint(square, { lon: 11.55, lat: 48.15 })).toBe(true);
    expect(containsPoint(square, { lon: 11.65, lat: 48.15 })).toBe(false);
    expect(distanceToFeature(square, { lon: 11.55, lat: 48.15 })).toBe(0);
    const d = distanceToFeature(square, { lon: 11.61, lat: 48.15 });
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(800);
    expect(Math.round(haversine({ lat: 48.1374, lon: 11.5755 }, { lat: 48.1402, lon: 11.5586 }))).toBeGreaterThan(1200);
  });
  it("parses DMS coordinates from the P+R CSVs", () => {
    expect(parseCoordinate("48°05'51.0\"N")).toBeCloseTo(48.0975, 4);
    expect(parseCoordinate("11°31'28.3\"E")).toBeCloseTo(11.52453, 4);
    expect(parseCoordinate("48,1374")).toBeCloseTo(48.1374, 4);
    expect(parseCoordinate("")).toBeUndefined();
  });
});

describe("text", () => {
  it("stems and folds German", () => {
    expect(fold("Straße Öffnungszeiten")).toBe("strasse oeffnungszeiten");
    expect(cistem("anmelden")).toBe(cistem("anmeldung").slice(0, cistem("anmelden").length));
    expect(processTerm("der")).toBeNull();
    expect(processTerm("Wohnsitz")).toBe(processTerm("wohnsitze"));
  });
  it("repairs double-encoded umlauts", () => {
    expect(fixMojibake("GroÃŸer Stadtbach")).toBe("Großer Stadtbach");
    expect(fixMojibake("FloÃŸÂŸkanal")).toBe("Floßkanal");
    expect(fixMojibake("Müllerstraße")).toBe("Müllerstraße");
  });
  it("strips HTML with German entities", () => {
    expect(stripHtml("<strong>Betreff:</strong><br>Stromz&auml;hler &amp; Leerstand")).toBe("Betreff:\nStromzähler & Leerstand");
  });
});

describe("wiki", () => {
  it("parses frontmatter and links", () => {
    const { data, body } = parseFrontmatter("---\ntitle: Test\ntags: [a, b]\n---\n\nSee [[topics/anmeldung|Anmeldung]] and [[KVR]].");
    expect(data.title).toBe("Test");
    expect(extractLinks(body)).toEqual(["topics/anmeldung", "kvr"]);
    expect(normalizeSlug("Topics/Straßen Namen.md")).toBe("topics/strassen-namen");
  });
});

describe("feeds", () => {
  it("parses the RIS RSS format", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>StR-Antrag Nr. 26-32 / F 00084 vom 25.09.2026</title><link>https://risi.muenchen.de/risi/antrag/detail/10021308</link><description>&lt;strong&gt;Betreff:&lt;/strong&gt;&lt;br&gt;Baustellenchaos durch Starkregen&lt;br&gt;&lt;strong&gt;Typ:&lt;/strong&gt; Anfrage</description><pubDate>Fri, 25 Sep 2026 09:26:34 +0200</pubDate></item></channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].link).toContain("10021308");
    expect(items[0].description).toContain("Baustellenchaos durch Starkregen");
  });
});

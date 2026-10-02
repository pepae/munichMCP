import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { floodAt, noiseAt, type NoiseValue } from "../sources/risks.js";
import { locate, locationFields, locationLine } from "./common.js";
import { noiseLines } from "./address.js";
import { citationsMd, defineTool } from "./util.js";

const NOISE_WMS = "https://www.lfu.bayern.de/gdi/wms/laerm/ballungsraeume";
const FLOOD_WMS = "https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete";

const LEGEND = [
  { color: "rgb(184,214,209)", label: "50-54" },
  { color: "rgb(226,242,191)", label: "55-59" },
  { color: "rgb(243,198,131)", label: "60-64" },
  { color: "rgb(205,70,62)", label: "65-69" },
  { color: "rgb(117,8,92)", label: "70-74" },
  { color: "rgb(67,10,74)", label: "75+ dB(A)" },
];

const fmt = (v?: NoiseValue) => (!v ? "n/a" : v.db !== null ? `${v.db.toFixed(1)} dB(A)` : (v.band ?? `under ${v.metric === "Lnight" ? 50 : 55} dB(A)`));

/** "76.5 dB(A) Lden, 69.8 dB(A) Lnight", or a single "not mapped" when nothing reaches the thresholds. */
const pair = (day?: NoiseValue, night?: NoiseValue) =>
  !day?.band && !night?.band ? `not mapped here (under 55 dB(A) Lden${night ? " and 50 dB(A) Lnight" : ""})` : `${fmt(day)} Lden${night ? `, ${fmt(night)} Lnight` : ""}`;

export function registerRiskTools(server: McpServer) {
  defineTool(
    server,
    "noise_and_flood",
    {
      title: "Noise and flood risk at a Munich address",
      description:
        "How loud is it and can it flood? Official EU environmental noise maps 2022 for Munich (road traffic, tram and U-Bahn, industry; Lden = weighted 24 h level and " +
        "Lnight = 22-6 h level in dB(A), loudest side of the building) and river flood hazard maps (frequent, 100-year and extreme flood, flood-protected areas, designated " +
        "flood zones) from the Bavarian Environment Agency (LfU). Useful for flat hunting, choosing a bedroom side, insurance and building questions. Shows the noise map with switchable layers.",
      input: z.object({ ...locationFields }),
      ui: true,
      invoking: "Reading the official noise and flood maps…",
      invoked: "Noise and flood check ready",
    },
    async (a) => {
      const loc = await locate(a);
      const [noise, flood] = await Promise.all([noiseAt(loc), floodAt(loc)]);
      const get = (id: string) => noise.values.find((v) => v.id === id);
      const L = [
        `Noise and flood check for ${loc.label}`,
        locationLine(loc),
        "",
        "Noise (EU environmental noise maps 2022, modelled 4 m above ground; loudest mapped level within 40 m of the address point, usually the street side):",
        `- Road traffic: ${pair(get("road_lden"), get("road_lnight"))}`,
        `- Tram and U-Bahn: ${pair(get("rail_lden"), get("rail_lnight"))}`,
        `- Industrial plants: ${pair(get("industry_lden"))}`,
        `Assessment: ${noise.verdict}`,
        "For orientation: WHO guideline values are 53 dB Lden / 45 dB Lnight for road traffic and 54 / 44 for rail; every 10 dB more is perceived as roughly twice as loud. " +
          "Courtyard sides are often 10-20 dB quieter. Not included: S-Bahn and mainline railways (mapped by the Eisenbahn-Bundesamt) and aircraft noise.",
        "",
        `River flood (LfU flood hazard maps): ${flood.verdict}`,
        ...flood.hits.map((h) => `- ${h.label}${h.water ? `, ${h.water}` : ""}${h.determined ? ` (as of ${h.determined})` : ""}`),
      ];
      const loud = /^(Very loud|Loud)/.test(noise.verdict);
      const floodTone = flood.hits.some((h) => h.id !== "hq_extrem") ? "bad" : flood.hits.length ? "warn" : "good";
      const lines = noiseLines(noise.values);
      return {
        text: L.join("\n") + citationsMd([loc.citation, noise.citation, flood.citation]),
        data: { location: loc, noise: { verdict: noise.verdict, levels: noise.values, search_radius_m: 40 }, flood: { verdict: flood.verdict, mapped: flood.hits }, sources: [loc.citation, noise.citation, flood.citation] },
        view: {
          kind: "map",
          title: "Noise and flood check",
          subtitle: loc.label,
          center: loc,
          zoom: 17,
          origin: { lat: loc.lat, lon: loc.lon, label: loc.label },
          cards: [
            { title: "Noise", tone: loud ? "bad" : lines.length ? "warn" : "good", lines: [noise.verdict.split(":")[0]] },
            ...[
              { title: "Road traffic", day: get("road_lden"), night: get("road_lnight") },
              { title: "Tram / U-Bahn", day: get("rail_lden"), night: get("rail_lnight") },
              { title: "Industry", day: get("industry_lden"), night: undefined },
            ]
              .filter((c) => c.day?.band || c.night?.band)
              .map((c) => ({ title: c.title, lines: [`24 h: ${fmt(c.day)}`, c.night ? `Night: ${fmt(c.night)}` : ""] })),
            { title: "River flood", tone: floodTone, lines: [flood.hits.length ? flood.verdict.split(":")[0] : "Outside mapped flood areas"] },
          ],
          overlays: [
            { label: "Road noise (Lden)", url: NOISE_WMS, layers: "aggroadlden2022", visible: true },
            { label: "Road noise (night)", url: NOISE_WMS, layers: "aggroadln2022" },
            { label: "Tram and U-Bahn (Lden)", url: NOISE_WMS, layers: "aggraillden2022" },
            { label: "Flood: 100-year", url: FLOOD_WMS, layers: "hwgf_hq100", opacity: 0.5, visible: flood.hits.length > 0 },
            { label: "Flood: extreme", url: FLOOD_WMS, layers: "hwgf_hqextrem", opacity: 0.4 },
          ],
          legend: LEGEND,
          attribution: "Bayerisches Landesamt für Umwelt, www.lfu.bayern.de (CC BY 4.0)",
        },
      };
    },
  );
}

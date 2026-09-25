import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fmtDistance } from "../lib/geo.js";
import { airQuality, floodClass, isarGauges, isarSpot, pollen, weatherNow } from "../sources/environment.js";
import { locate, locationFields } from "./common.js";
import { citationsMd, defineTool } from "./util.js";

const FLAUCHER = { lat: 48.1105, lon: 11.5575 };

export function registerEnvironmentTools(server: McpServer) {
  defineTool(
    server,
    "isar_conditions",
    {
      title: "Isar river conditions and swimming rules",
      description:
        "Live Isar conditions in Munich: water level, discharge and flood warning level (Hochwassernachrichtendienst Bayern), water temperature, current weather, " +
        "and the city's official swimming rules at a spot (zones where bathing is allowed or prohibited, nearby danger spots such as weirs). " +
        "Default spot: Flaucher. Answers 'can I swim in the Isar at X today?'.",
      input: z.object({ ...locationFields }),
      ui: true,
      invoking: "Reading Isar gauges…",
    },
    async (a) => {
      const loc = a.address || a.lat !== undefined ? await locate(a) : { ...FLAUCHER, label: "Flaucher (Isar)", precision: "place" as const, source: "input" as const };
      const [gauges, spot, wx, flood] = await Promise.all([isarGauges().catch((e) => ({ error: String(e) })), isarSpot(loc), weatherNow(loc).catch(() => undefined), floodClass().catch(() => undefined)]);
      const L: string[] = [`Isar conditions for ${loc.label}:`];
      if ("error" in gauges) L.push(`Gauge data unavailable right now (${gauges.error}).`);
      else {
        for (const g of gauges.gauges)
          L.push(
            `- ${g.name}: ${g.water_level_cm !== undefined ? `water level ${g.water_level_cm} cm` : ""}${g.discharge_m3s !== undefined ? `, discharge ${g.discharge_m3s} m³/s` : ""}` +
              `${g.water_temp_c !== undefined ? `, water ${g.water_temp_c} °C` : ""}${g.measured_at ? ` (measured ${g.measured_at})` : ""}${g.flood_level ? `; flood warning level: ${g.flood_level}` : ""}`,
          );
        if (gauges.note) L.push(gauges.note);
      }
      if (flood) L.push(`Official flood status (LHP): ${flood.label}${flood.alerts ? `; ${flood.alerts} active flood warning(s) in Bavaria` : ""}. Datenquelle: www.hochwasserzentralen.de, Stand: ${flood.stand}`);
      L.push(
        spot.swimming === "allowed"
          ? `Swimming: allowed at this spot (${spot.water_body ?? "Isar"}), always at your own risk.`
          : spot.swimming === "prohibited"
            ? `Swimming: PROHIBITED at this spot (${spot.water_body ?? "zone"}).${spot.nearest_allowed_zone_m !== undefined ? ` Nearest zone where bathing is allowed: ${fmtDistance(spot.nearest_allowed_zone_m)} away.` : ""}`
            : `Swimming: this point is not inside a mapped bathing zone.${spot.nearest_allowed_zone_m !== undefined ? ` Nearest zone where bathing is allowed: ${fmtDistance(spot.nearest_allowed_zone_m)} away.` : ""}`,
      );
      if (spot.danger_spots.length) L.push(`Danger spots nearby: ${spot.danger_spots.map((d) => `${d.name} (${fmtDistance(d.distance_m)}): ${d.warning}`).join("; ")}`);
      if (wx) L.push(`Weather: ${wx.temperature_c ?? "?"} °C, ${wx.condition ?? ""}; today ${wx.today?.min_c ?? "?"}-${wx.today?.max_c ?? "?"} °C, rain ${wx.today?.precipitation_mm ?? 0} mm.${wx.alerts.length ? ` DWD warnings: ${wx.alerts.map((x) => x.headline).join("; ")}` : ""}`);
      L.push("The city warns: never swim near weirs, locks or outlets, and stay out of the water at high water (strong current, debris).");
      const cits = ["error" in gauges ? undefined : gauges.citation, flood?.citation, wx?.citation];
      return {
        text: L.join("\n") + citationsMd([...cits, { name: "Baden und Bootfahren in der Isar (Bade- und Bootverordnung zones)", publisher: "Landeshauptstadt München, Referat für Klima- und Umweltschutz", license: "dl-de/by-2.0", url: "https://opendata.muenchen.de/dataset/baden_isar_opendata" }]),
        data: { location: loc, gauges: "error" in gauges ? undefined : gauges.gauges, flood_status: flood, swimming: { ...spot, zones: undefined }, weather: wx },
        view: {
          kind: "map",
          title: "Isar conditions",
          subtitle: loc.label,
          center: loc,
          zoom: 15,
          origin: { lat: loc.lat, lon: loc.lon, label: loc.label },
          banner: { tone: spot.swimming === "allowed" ? "good" : "bad", text: spot.swimming === "allowed" ? "Bathing allowed here (at your own risk)" : spot.swimming === "prohibited" ? "Bathing prohibited here" : "Not a mapped bathing zone" },
          cards: [
            ...("error" in gauges ? [] : gauges.gauges.map((g) => ({ title: g.name, lines: [g.water_level_cm !== undefined ? `${g.water_level_cm} cm` : "", g.discharge_m3s !== undefined ? `${g.discharge_m3s} m³/s` : "", g.water_temp_c !== undefined ? `${g.water_temp_c} °C water` : "", g.flood_level ?? ""].filter(Boolean), tone: g.flood_level && !/^no /.test(g.flood_level) ? "warn" : undefined }))),
            ...(wx ? [{ title: "Weather", lines: [`${wx.temperature_c ?? "?"} °C ${wx.condition ?? ""}`, `today ${wx.today?.min_c ?? "?"}-${wx.today?.max_c ?? "?"} °C`] }] : []),
          ],
          shapes: spot.zones.map((z) => ({ geometry: z.geometry, label: z.allowed ? "Bathing allowed" : "Bathing prohibited", color: z.allowed ? "#2f9e44" : "#c92a2a" })),
          markers: spot.danger_spots.map((d) => ({ lat: d.lat, lon: d.lon, label: d.name, sublabel: d.warning.slice(0, 120), color: "#e67700" })),
          attribution: "LfU Bayern (HND/GKD), DWD, Landeshauptstadt München",
        },
      };
    },
  );

  defineTool(
    server,
    "weather_air_pollen",
    {
      title: "Weather, warnings, air quality and pollen",
      description:
        "Current weather and today's/tomorrow's forecast for a point in Munich (Deutscher Wetterdienst via Bright Sky), official DWD weather warnings, " +
        "latest air quality at the nearest official Munich measuring station (Umweltbundesamt: NO2, PM10, PM2.5, O3) and today's DWD pollen forecast for Oberbayern.",
      input: z.object({ ...locationFields }),
    },
    async (a) => {
      const loc = a.address || a.lat !== undefined ? await locate(a) : { lat: 48.1374, lon: 11.5755, label: "München (Marienplatz)" };
      const [wx, air, pol] = await Promise.all([weatherNow(loc), airQuality(loc).catch((e) => ({ error: String(e) })), pollen().catch(() => undefined)]);
      const L: string[] = [];
      L.push(`Weather at ${loc.label} (${wx.at?.slice(11, 16)} UTC): ${wx.temperature_c ?? "?"} °C, ${wx.condition ?? "?"}, wind ${wx.wind_kmh ?? "?"} km/h${wx.gust_kmh ? ` (gusts ${wx.gust_kmh})` : ""}, humidity ${wx.humidity_pct ?? "?"} %, cloud cover ${wx.cloud_cover_pct ?? "?"} %.`);
      if (wx.today) L.push(`Today: ${wx.today.min_c}-${wx.today.max_c} °C, precipitation ${wx.today.precipitation_mm} mm, sunshine ${wx.today.sunshine_h} h.`);
      if (wx.tomorrow) L.push(`Tomorrow: ${wx.tomorrow.min_c}-${wx.tomorrow.max_c} °C, precipitation ${wx.tomorrow.precipitation_mm} mm.`);
      L.push(wx.alerts.length ? `DWD warnings (${wx.warn_cell}): ${wx.alerts.map((x) => `${x.severity}: ${x.headline}`).join("; ")}` : `DWD warnings: none for ${wx.warn_cell ?? "Munich"}.`);
      if ("error" in air) L.push(`Air quality: unavailable (${air.error}).`);
      else L.push(`Air quality at ${air.station} (${fmtDistance(air.distance_m)} away, ${air.measured_at ?? "latest"}): ${air.components.map((c) => `${c.name} ${c.value} ${c.unit}`).join(", ")}${air.index ? `; air quality index: ${air.index}` : ""}.`);
      if (pol) {
        const active = pol.types.filter((t) => t.today !== "none");
        L.push(`Pollen today (${pol.region}): ${active.length ? active.map((t) => `${t.type} ${t.today}`).join(", ") : "no relevant pollen"}.`);
      }
      return {
        text: L.join("\n") + citationsMd([wx.citation, "error" in air ? undefined : air.citation, pol?.citation]),
        data: { location: loc, weather: wx, air_quality: "error" in air ? undefined : air, pollen: pol },
      };
    },
  );
}

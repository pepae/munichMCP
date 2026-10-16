import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fmtDistance } from "../lib/geo.js";
import { mobilityRulesAt } from "../sources/mobility.js";
import { CATEGORIES, categoryIds, findNearby } from "../sources/places.js";
import { reportsNear } from "../sources/reports.js";
import { roadworksNear } from "../sources/roadworks.js";
import { locate, locationFields, locationLine } from "./common.js";
import { citationsMd, defineTool } from "./util.js";

const categoryList = CATEGORIES.map((c) => `${c.id} (${c.label})`).join("; ");

export function registerPlaceTools(server: McpServer) {
  defineTool(
    server,
    "find_nearby",
    {
      title: "Find nearby city facilities",
      description:
        "Find the nearest official City of Munich facilities of a category around an address or point, from municipal open data " +
        "(authoritative city records, not web listings). Categories: " +
        categoryList +
        ". Returns distance-sorted results with details (opening hours, operator, prices where published) and shows them on a map.",
      input: z.object({
        category: z.enum(categoryIds).describe("Facility category id"),
        ...locationFields,
        radius_m: z.number().int().min(50).max(15000).default(2000).describe("Search radius in metres"),
        limit: z.number().int().min(1).max(25).default(6),
        filter: z.string().max(80).optional().describe("Optional text filter on name/details, e.g. 'Krippe', 'Sauna', 'barrierefrei'"),
      }),
      ui: true,
      invoking: "Searching city open data…",
      invoked: "Found nearby places",
    },
    async (a) => {
      const loc = await locate(a);
      const r = await findNearby(a.category, loc, { limit: a.limit, radiusM: a.radius_m, query: a.filter });
      const lines = r.items.map((p, i) => {
        const det = Object.entries(p.details)
          .slice(0, 6)
          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
          .join("; ");
        return `${i + 1}. ${p.name} (${fmtDistance(p.distance_m)})${p.address ? `, ${p.address}` : ""}${det ? `\n   ${det}` : ""}${p.url ? `\n   ${p.url}` : ""}`;
      });
      const text =
        `${r.label} near ${loc.label}: ${r.total_in_radius} within ${fmtDistance(a.radius_m)}${r.items.length ? `, nearest ${r.items.length}:` : "."}\n` +
        `${locationLine(loc)}\n\n${lines.join("\n")}` +
        (r.items.length ? "" : "\nNo results in this radius; try a larger radius_m.") +
        citationsMd([r.citation, loc.citation]);
      return {
        text,
        data: { location: loc, category: r.category, label: r.label, total_in_radius: r.total_in_radius, items: r.items, sources: [r.citation, loc.citation].filter(Boolean) },
        view: {
          kind: "map",
          title: r.label,
          subtitle: `near ${loc.label}`,
          center: loc,
          origin: { lat: loc.lat, lon: loc.lon, label: loc.label },
          markers: r.items.map((p) => ({ lat: p.lat, lon: p.lon, label: p.name, sublabel: [fmtDistance(p.distance_m), p.address].filter(Boolean).join(", "), href: p.url, details: p.details })),
          attribution: r.citation.publisher,
        },
      };
    },
  );

  defineTool(
    server,
    "roadworks_near",
    {
      title: "Roadworks and temporary no-parking zones",
      description:
        "Official list of construction sites and temporary no-parking/stopping restrictions (Haltverbote) affecting walking, cycling, driving or parking in Munich within the next ~4 weeks (Mobilitätsreferat, updated continuously). Use for 'can I park on my street next week', 'why is my road closed', 'will my move be affected'.",
      input: z.object({
        ...locationFields,
        radius_m: z.number().int().min(20).max(3000).default(300),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Day to check (YYYY-MM-DD), default today"),
        limit: z.number().int().min(1).max(40).default(12),
      }),
      ui: true,
      invoking: "Checking roadworks…",
    },
    async (a) => {
      const loc = await locate(a);
      const r = await roadworksNear(loc, { radiusM: a.radius_m, date: a.date, limit: a.limit, includeGeometry: true });
      const day = a.date ?? new Date().toISOString().slice(0, 10);
      const lines = r.items.map(
        (w, i) =>
          `${i + 1}. ${w.where} (${fmtDistance(w.distance_m)}) ${w.active_on_date ? "ACTIVE" : "not active"} on ${day}: ${w.kind ?? ""}; ${w.from ?? "?"} to ${w.until ?? "?"}` +
          `${w.impact ? `\n   Impact: ${w.impact}` : ""}${w.affected ? ` (affects: ${w.affected})` : ""}${w.description ? `\n   ${w.description.slice(0, 260)}` : ""}`,
      );
      const active = r.items.filter((w) => w.active_on_date).length;
      return {
        text:
          `${r.total} roadworks/restrictions within ${fmtDistance(a.radius_m)} of ${loc.label}; ${active} of the listed ones active on ${day}.\n${locationLine(loc)}\n\n` +
          (lines.join("\n") || "None found.") +
          citationsMd([r.citation, loc.citation]),
        data: { location: loc, date: day, total: r.total, items: r.items.map(({ geometry: _g, ...w }) => w), sources: [r.citation] },
        view: {
          kind: "map",
          title: "Roadworks & restrictions",
          subtitle: `${loc.label}, ${day}`,
          center: loc,
          origin: { lat: loc.lat, lon: loc.lon, label: loc.label },
          radius_m: a.radius_m,
          shapes: r.items.filter((w) => w.geometry).map((w) => ({ geometry: w.geometry, label: w.where, sublabel: `${w.from} to ${w.until}: ${w.impact ?? w.kind ?? ""}`, color: w.active_on_date ? "#d9480f" : "#868e96" })),
          markers: [],
          attribution: r.citation.publisher,
        },
      };
    },
  );

  defineTool(
    server,
    "damage_reports_near",
    {
      title: "Citizen damage reports nearby",
      description:
        "Reports on machmuenchenbesser.de (the City of Munich's platform for reporting damage and dirt: broken street lights, traffic lights, potholes, graffiti, " +
        "overflowing bins, damaged playgrounds...) near an address, from the last ~4 months, with category, status (open / in progress / done) and date. " +
        "Use it to check whether a problem is already reported before telling the user to report it at https://machmuenchenbesser.de.",
      input: z.object({
        ...locationFields,
        radius_m: z.number().int().min(20).max(3000).default(300),
        status: z.enum(["open", "closed", "all"]).default("all"),
        filter: z.string().max(80).optional().describe("Text filter, e.g. 'Leuchte', 'Ampel', 'Graffiti', 'Spielplatz'"),
        limit: z.number().int().min(1).max(40).default(12),
      }),
      ui: true,
    },
    async (a) => {
      const loc = await locate(a);
      const r = await reportsNear(loc, { radiusM: a.radius_m, status: a.status, query: a.filter, limit: a.limit });
      const lines = r.items.map(
        (x, i) => `${i + 1}. ${x.category} (${fmtDistance(x.distance_m ?? 0)}), ${x.status_text ?? x.status}, reported ${x.reported.slice(0, 10)}${x.address ? `, ${x.address}` : ""}${x.description ? `\n   "${x.description.slice(0, 160)}"` : ""}\n   ${x.url}`,
      );
      return {
        text:
          `${r.total} citizen report(s) within ${fmtDistance(a.radius_m)} of ${loc.label} (last ~4 months${a.status !== "all" ? `, status ${a.status}` : ""}):\n${locationLine(loc)}\n\n` +
          (lines.join("\n") || "None found. New problems can be reported at https://machmuenchenbesser.de.") +
          citationsMd([r.citation, loc.citation]),
        data: { location: loc, total: r.total, reports: r.items, sources: [r.citation] },
        view: {
          kind: "map",
          title: "Citizen damage reports",
          subtitle: `near ${loc.label}`,
          center: loc,
          origin: { lat: loc.lat, lon: loc.lon, label: loc.label },
          radius_m: a.radius_m,
          markers: r.items.map((x) => ({ lat: x.lat, lon: x.lon, label: x.category, sublabel: `${x.status_text ?? x.status}, ${x.reported.slice(0, 10)}, ${fmtDistance(x.distance_m ?? 0)}`, href: x.url, color: x.status === "open" ? "#e67700" : "#868e96" })),
          attribution: "machmuenchenbesser.de (CC0)",
        },
      };
    },
  );

  defineTool(
    server,
    "mobility_rules_at",
    {
      title: "Scooter & bike-sharing rules at a spot",
      description:
        "Check the City of Munich's official micromobility rules at an exact spot: is it an e-scooter no-riding zone (Fahrverbotszone) or no-parking zone (Abstellverbotszone), " +
        "may shared bikes be parked, is it a pedestrian zone, and where are the nearest designated parking areas for e-scooters, bike sharing, e-mopeds and cargo bikes. " +
        "Answers 'can I leave my scooter here?' from the city's own geofence data.",
      input: z.object({ ...locationFields }),
      ui: true,
      invoking: "Checking city micromobility zones…",
    },
    async (a) => {
      const loc = await locate(a);
      const r = await mobilityRulesAt(loc);
      const spot = (s: { name: string; description?: string; distance_m: number; allowed: string[] }) =>
        `${s.name}${s.description ? ` (${s.description})` : ""}, ${fmtDistance(s.distance_m)}${s.allowed.length ? ` [${s.allowed.join(", ")}]` : ""}`;
      const text =
        `Micromobility rules at ${loc.label}:\n${locationLine(loc)}\n\n` +
        `E-scooters: ${r.escooter.verdict}\n` +
        (r.escooter.nearest_parking.length ? `Nearest designated e-scooter parking: ${r.escooter.nearest_parking.map(spot).join("; ")}\n` : "") +
        `Bike sharing: ${r.bikesharing.verdict}\n` +
        (r.bikesharing.nearest_parking.length ? `Nearest bike-sharing parking: ${r.bikesharing.nearest_parking.map(spot).join("; ")}\n` : "") +
        (r.moped.nearest_parking.length ? `E-moped sharing parking: ${r.moped.nearest_parking.map(spot).join("; ")}\n` : "") +
        (r.cargobike.nearest_parking.length ? `Cargo-bike sharing parking: ${r.cargobike.nearest_parking.map(spot).join("; ")}\n` : "") +
        (r.pedestrian_zone ? "This spot is inside a pedestrian zone (Fußgängerzone): cycling/scooting is generally not allowed unless signposted.\n" : "") +
        citationsMd([r.citation, loc.citation]);
      const allSpots = [
        ...r.escooter.nearest_parking.map((s) => ({ ...s, t: "e-scooter" })),
        ...r.bikesharing.nearest_parking.map((s) => ({ ...s, t: "bike sharing" })),
        ...r.moped.nearest_parking.map((s) => ({ ...s, t: "e-moped" })),
        ...r.cargobike.nearest_parking.map((s) => ({ ...s, t: "cargo bike" })),
      ];
      const uniq = new Map(allSpots.map((s) => [`${s.lat},${s.lon}`, s]));
      const strip = <T extends { _geometry?: unknown }>(s: T) => {
        const { _geometry, ...rest } = s;
        return rest;
      };
      return {
        text,
        data: {
          location: loc,
          escooter: { ...r.escooter, nearest_parking: r.escooter.nearest_parking.map(strip) },
          bikesharing: { ...r.bikesharing, nearest_parking: r.bikesharing.nearest_parking.map(strip) },
          moped: { nearest_parking: r.moped.nearest_parking.map(strip) },
          cargobike: { nearest_parking: r.cargobike.nearest_parking.map(strip) },
          pedestrian_zone: r.pedestrian_zone,
          sources: [r.citation],
        },
        view: {
          kind: "map",
          title: "Micromobility rules",
          subtitle: loc.label,
          center: loc,
          origin: { lat: loc.lat, lon: loc.lon, label: loc.label },
          banner: {
            tone: r.escooter.parking_prohibited.length || r.escooter.riding_prohibited.length || r.escooter.must_use_designated_area ? "bad" : "good",
            text: r.escooter.verdict,
          },
          shapes: [...uniq.values()].filter((s: any) => s._geometry).map((s: any) => ({ geometry: s._geometry, label: s.name, sublabel: `${s.t} parking, ${fmtDistance(s.distance_m)}`, color: "#2f9e44" })),
          markers: [...uniq.values()].map((s) => ({ lat: s.lat, lon: s.lon, label: s.name, sublabel: `${s.allowed.join(", ")} (${fmtDistance(s.distance_m)})` })),
          attribution: r.citation.publisher,
        },
      };
    },
  );
}

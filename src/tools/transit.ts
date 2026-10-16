import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fmtDistance } from "../lib/geo.js";
import { departures, nearbyStations, planTrip, resolvePlace, resolveStation, TRANSPORT_TYPES, transitMessages } from "../sources/transit.js";
import { locate, locationFields } from "./common.js";
import { citationsMd, defineTool } from "./util.js";

const TYPE_LABEL: Record<string, string> = { UBAHN: "U-Bahn", SBAHN: "S-Bahn", TRAM: "Tram", BUS: "Bus", REGIONAL_BUS: "Regionalbus", BAHN: "Train", SCHIFF: "Boat", RUFTAXI: "Ruftaxi" };

const berlinTime = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function registerTransitTools(server: McpServer) {
  defineTool(
    server,
    "departures",
    {
      title: "Live departures (MVG/MVV)",
      description:
        "Real-time departures (with delays, cancellations, replacement services, platform) for a Munich public transport station: U-Bahn, S-Bahn, tram, bus. " +
        "Give a station name ('Sendlinger Tor', 'Hauptbahnhof') or an address/coordinates to use the nearest station. Shows a live departure board.",
      input: z.object({
        station: z.string().max(120).optional().describe("Station name or MVG global id (de:09162:...)"),
        ...locationFields,
        transport_types: z.array(z.enum(TRANSPORT_TYPES)).optional().describe("Filter, e.g. ['UBAHN'] or ['SBAHN','TRAM']"),
        limit: z.number().int().min(1).max(40).default(12),
        offset_minutes: z.number().int().min(0).max(240).default(0).describe("Walking time to the station: skip departures leaving sooner"),
      }),
      ui: true,
      invoking: "Fetching live departures…",
    },
    async (a) => {
      const at = a.station ? undefined : await locate(a);
      const st = await resolveStation({ station: a.station, at });
      const r0 = await departures(st.id, { limit: a.limit, types: a.transport_types, offsetMin: a.offset_minutes });
      // MVG sometimes appends a far-future trip; keep the list to what was asked for.
      const r = { ...r0, items: r0.items.slice(0, a.limit) };
      const { alternatives, ...station } = st;
      const lines = r.items.map(
        (d) =>
          `${berlinTime(d.expected)} (${d.in_minutes} min) ${d.line} to ${d.destination}` +
          `${d.cancelled ? " CANCELLED" : d.delay_min ? ` (${d.delay_min > 0 ? "+" : ""}${d.delay_min} min)` : ""}${d.platform !== undefined ? `, platform ${d.platform}` : ""}${d.replacement_service ? ", replacement service (SEV)" : ""}${d.realtime ? "" : " (scheduled)"}` +
          `${d.notes.length ? `\n   ${d.notes.join(" / ").slice(0, 200)}` : ""}`,
      );
      const text =
        `Departures at ${st.name}${st.place && st.place !== "München" ? ` (${st.place})` : ""}${st.distance_m !== undefined && at ? `, ${fmtDistance(st.distance_m)} from ${at.label}` : ""} [${st.id}]` +
        `, as of ${berlinTime(new Date(r.fetchedAt).toISOString())}${r.stale ? " (cached, live source unavailable)" : ""}:\n` +
        (lines.join("\n") || "No departures found.") +
        (alternatives?.length ? `\n\nOther stops nearby: ${alternatives.map((s) => `${s.name} ${fmtDistance(s.distance_m ?? 0)} (${s.transport_types.map((t) => TYPE_LABEL[t] ?? t).join(", ")})`).join("; ")}` : "") +
        citationsMd([r.citation, at?.citation]);
      return {
        text,
        data: { station, other_stops_nearby: alternatives, fetched_at: new Date(r.fetchedAt).toISOString(), departures: r.items, sources: [r.citation] },
        view: {
          kind: "departures",
          station,
          fetched_at: new Date(r.fetchedAt).toISOString(),
          departures: r.items,
          refresh: { tool: "departures", arguments: { station: st.id, transport_types: a.transport_types, limit: a.limit, offset_minutes: a.offset_minutes } },
          attribution: "MVG (unofficial API, cached)",
        },
      };
    },
  );

  defineTool(
    server,
    "plan_trip",
    {
      title: "Plan a public transport trip",
      description:
        "Door-to-door public transport connections in Munich (MVG/MVV journey planner): walking legs, U-Bahn/S-Bahn/tram/bus legs with lines and real-time delays, " +
        "number of changes, walking distance and fare zones. Give origin and destination as addresses or places ('Marienplatz', 'Leopoldstr. 20'). Shows the route on a map.",
      input: z.object({
        from: z.string().min(2).max(200).describe("Origin address or place"),
        to: z.string().min(2).max(200).describe("Destination address or place"),
        at: z.string().max(40).optional().describe("ISO date-time (e.g. 2026-09-26T08:30:00+02:00); default now"),
        arrive_by: z.boolean().default(false).describe("Interpret 'at' as the latest arrival time"),
        transport_types: z.array(z.enum(TRANSPORT_TYPES)).optional(),
      }),
      ui: true,
      invoking: "Planning your trip…",
    },
    async (a) => {
      const [from, to] = await Promise.all([resolvePlace(a.from), resolvePlace(a.to)]);
      const r = await planTrip(from, to, { at: a.at, arriveBy: a.arrive_by, types: a.transport_types });
      if (!r.trips.length) throw new Error(`No connection found from ${from.label} to ${to.label}`);
      // The router names the address it snapped to; show the destination the user asked for.
      const dest = to.label.replace(/, München$/, "");
      for (const t of r.trips) {
        const last = t.legs.at(-1);
        if (last?.mode === "PEDESTRIAN" && to.kind === "address") last.to = dest;
      }
      const legTxt = (l: (typeof r.trips)[number]["legs"][number]) =>
        l.mode === "PEDESTRIAN"
          ? `walk ${l.distance_m ?? "?"} m to ${l.to}`
          : `${berlinTime(l.departure)} ${l.line} (${TYPE_LABEL[l.mode] ?? l.mode}) from ${l.from}${l.platform !== undefined ? ` platform ${l.platform}` : ""} towards ${l.direction ?? "?"}, get off at ${l.to} ${berlinTime(l.arrival)}` +
            `${l.arrival_delay_min ? ` (${l.arrival_delay_min > 0 ? "+" : ""}${l.arrival_delay_min} min)` : ""}${l.cancelled ? " CANCELLED" : ""}`;
      const text =
        `Connections from ${from.label} to ${to.label}:\n\n` +
        r.trips
          .map((t, i) => `${i + 1}. ${berlinTime(t.departure)} to ${berlinTime(t.arrival)} (${t.duration_min} min, ${t.changes} change${t.changes === 1 ? "" : "s"}, ${t.walking_m} m walking, zone ${t.zones.join("/") || "?"})\n   ${t.legs.map(legTxt).join("\n   ")}`)
          .join("\n\n") +
        citationsMd([r.citation]);
      const best = r.trips[0];
      const COLORS: Record<string, string> = { UBAHN: "#0065ae", SBAHN: "#408335", TRAM: "#d82020", BUS: "#00586a", REGIONAL_BUS: "#00586a", PEDESTRIAN: "#868e96", BAHN: "#555555" };
      return {
        text,
        data: { from, to, trips: r.trips.map((t) => ({ ...t, legs: t.legs.map(({ path: _p, ...l }) => l) })), sources: [r.citation] },
        view: {
          kind: "map",
          title: `${best.duration_min} min, ${best.changes} change${best.changes === 1 ? "" : "s"}`,
          subtitle: `${from.label} → ${to.label}, departs ${berlinTime(best.departure)}`,
          center: from,
          origin: { lat: from.lat, lon: from.lon, label: from.label },
          shapes: best.legs.filter((l) => l.path.length > 1).map((l) => ({ geometry: { type: "LineString", coordinates: l.path.map(([la, lo]) => [lo, la]) }, label: l.line ?? "walk", sublabel: `${l.from} → ${l.to}`, color: COLORS[l.mode] ?? "#1864ab" })),
          markers: [{ lat: to.lat, lon: to.lon, label: to.label, sublabel: `arrive ${berlinTime(best.arrival)}`, color: "#1864ab" }],
          cards: r.trips.slice(0, 3).map((t) => ({ title: `${berlinTime(t.departure)} → ${berlinTime(t.arrival)}`, lines: [`${t.duration_min} min, ${t.changes} changes`, t.legs.filter((l) => l.line).map((l) => l.line).join(" › ")] })),
          attribution: "MVG journey planner (unofficial API, cached)",
        },
      };
    },
  );

  defineTool(
    server,
    "nearby_stops",
    {
      title: "Nearest public transport stops",
      description: "List the nearest MVG/MVV stops to an address or point, with walking distance and which modes serve them.",
      input: z.object({ ...locationFields, limit: z.number().int().min(1).max(15).default(6) }),
    },
    async (a) => {
      const at = await locate(a);
      const st = await nearbyStations(at, a.limit);
      return {
        text: `Stops near ${at.label}:\n${st.map((s, i) => `${i + 1}. ${s.name} (${fmtDistance(s.distance_m ?? 0)}): ${s.transport_types.map((t) => TYPE_LABEL[t] ?? t).join(", ")} [${s.id}]`).join("\n")}` + citationsMd([at.citation]),
        data: { location: at, stops: st },
      };
    },
  );

  defineTool(
    server,
    "transit_disruptions",
    {
      title: "Current transit disruptions",
      description: "Current incidents and planned timetable changes in Munich public transport (MVG and S-Bahn), optionally for one line (e.g. 'U6', 'S8', '19').",
      input: z.object({
        line: z.string().max(10).optional(),
        type: z.enum(["INCIDENT", "SCHEDULE_CHANGE", "ALL"]).default("INCIDENT").describe("INCIDENT = current disruptions; SCHEDULE_CHANGE = planned changes (construction etc.)"),
        limit: z.number().int().min(1).max(50).default(15),
      }),
    },
    async (a) => {
      const r = await transitMessages({ line: a.line, type: a.type });
      const items = r.items.slice(0, a.limit);
      return {
        text:
          `${r.items.length} ${a.type === "ALL" ? "messages" : a.type === "INCIDENT" ? "current incidents" : "planned changes"}${a.line ? ` for ${a.line}` : ""}:\n\n` +
          (items.map((m) => `- [${m.lines.join(", ") || "network"}] ${m.title}${m.valid_to ? ` (until ${berlinTime(m.valid_to)} ${m.valid_to.slice(0, 10)})` : ""}\n  ${m.text.slice(0, 400)}`).join("\n") || "None.") +
          citationsMd([r.citation]),
        data: { total: r.items.length, items, sources: [r.citation] },
      };
    },
  );
}

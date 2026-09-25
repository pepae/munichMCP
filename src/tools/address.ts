import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { geocode } from "../lib/geocode.js";
import { fmtDistance } from "../lib/geo.js";
import { cite } from "../lib/sources.js";
import { addressFacts } from "../sources/address.js";
import { wohnlageAt, wohnlageMapUrl } from "../sources/mietspiegel.js";
import { mobilityRulesAt } from "../sources/mobility.js";
import { findNearby } from "../sources/places.js";
import { roadworksNear } from "../sources/roadworks.js";
import { nearbyStations } from "../sources/transit.js";
import { locate, locationFields, locationLine } from "./common.js";
import { citationsMd, defineTool } from "./util.js";

export function registerAddressTools(server: McpServer) {
  defineTool(
    server,
    "find_address",
    {
      title: "Find a Munich address",
      description: "Geocode an address, street or place in Munich using the City of Munich's official address index (with an OpenStreetMap fallback for landmarks). Returns candidates with coordinates.",
      input: z.object({ query: z.string().min(2).max(200).describe("e.g. 'Leopoldstr. 20', 'Tal 12', 'Olympiapark'") }),
    },
    async ({ query }) => {
      const hits = await geocode(query);
      return {
        text: hits.length
          ? `Candidates for "${query}":\n${hits.map((h, i) => `${i + 1}. ${h.label} (${h.lat.toFixed(5)}, ${h.lon.toFixed(5)}) [${h.precision}, ${h.source}]`).join("\n")}` +
            citationsMd([cite(hits[0].source === "photon" ? "photon" : "addressIndex", Date.now())])
          : `No match for "${query}" in Munich.`,
        data: { query, candidates: hits },
      };
    },
  );

  defineTool(
    server,
    "address_report",
    {
      title: "Everything that applies at a Munich address",
      description:
        "One-call civic report for an address in Munich from official city geodata: district (Stadtbezirk, Bezirksteil), legally binding zoning plans (Bebauungsplan, with PDF links), " +
        "Milieuschutz / Erhaltungssatzung area, residential location class of the Mietspiegel 2025, resident-parking licence area, low-emission zone, Tempo-30 zone, chimney-sweep district, " +
        "rooftop solar potential, roadworks and no-parking restrictions nearby, e-scooter parking rules, nearest public transport stops and everyday facilities. Shows a map.",
      input: z.object({ ...locationFields }),
      ui: true,
      invoking: "Querying city geodata…",
      invoked: "Address report ready",
    },
    async (a) => {
      const loc = await locate(a);
      const [facts, wohnlage, stations, works, mob, fountain, toilet, playground, glass, kitas, library] = await Promise.all([
        addressFacts(loc),
        wohnlageAt(loc).catch(() => undefined),
        nearbyStations(loc, 4).catch(() => undefined),
        roadworksNear(loc, { radiusM: 150, limit: 6 }).catch(() => undefined),
        mobilityRulesAt(loc).catch(() => undefined),
        findNearby("drinking_fountain", loc, { limit: 1, radiusM: 3000 }).catch(() => undefined),
        findNearby("public_toilet", loc, { limit: 1, radiusM: 3000 }).catch(() => undefined),
        findNearby("playground", loc, { limit: 1, radiusM: 3000 }).catch(() => undefined),
        findNearby("glass_container", loc, { limit: 1, radiusM: 3000 }).catch(() => undefined),
        findNearby("kita", loc, { limit: 3, radiusM: 500 }).catch(() => undefined),
        findNearby("library", loc, { limit: 1, radiusM: 5000 }).catch(() => undefined),
      ]);

      const L: string[] = [];
      L.push(`Address report for ${loc.label}`, locationLine(loc), "");
      if (facts.district) L.push(`District: ${facts.district.number} ${facts.district.name}${facts.district.district_part ? `, Bezirksteil ${facts.district.district_part}` : ""}${facts.district.quarter ? `, Viertel ${facts.district.quarter}` : ""}`);
      if (facts.zoning_plans.length)
        L.push(`Zoning: ${facts.zoning_plans.map((p) => `${p.kind} Nr. ${p.plan_number}${p.plan_pdf ? ` (plan: ${p.plan_pdf}${p.text_pdf ? `, text: ${p.text_pdf}` : ""})` : ""}`).join("; ")}`);
      else L.push("Zoning: no Bebauungsplan covers this point (in built-up areas, projects are then usually assessed under §34 BauGB: they must fit into the surroundings).");
      L.push(
        facts.milieuschutz
          ? `Milieuschutz: YES, Erhaltungssatzung "${facts.milieuschutz.area}" (since ${facts.milieuschutz.valid_from ?? "?"}). Under §172 BauGB, demolition, structural changes and changes of use need city approval, and conversion into condominiums is restricted. Statute: ${facts.milieuschutz.statute_pdf ?? "n/a"}`
          : "Milieuschutz: not in an Erhaltungssatzung (Milieuschutz) area.",
      );
      if (wohnlage) L.push(`Mietspiegel 2025 residential location: ${wohnlage.label}${wohnlage.note ? ` (${wohnlage.note})` : ""}`);
      else L.push(`Mietspiegel 2025 residential location (Wohnlage): read it on the official map ${wohnlageMapUrl(loc.label.replace(/, München$/, ""))} and use estimate_rent for the comparative rent.`);
      L.push(
        facts.resident_parking
          ? `Resident parking: licence area "${facts.resident_parking.area}" (${facts.resident_parking.status ?? ""}${facts.resident_parking.opened ? `, since ${facts.resident_parking.opened}` : ""}). Residents can apply for a Parkausweis.${facts.resident_parking.details_url ? ` Map: ${facts.resident_parking.details_url}` : ""}`
          : "Resident parking: not inside a Parkraummanagement (licence) area.",
      );
      if (facts.low_emission_zone) L.push(`Low-emission zone (Umweltzone): ${facts.low_emission_zone.inside ? `inside${facts.low_emission_zone.name ? ` (${facts.low_emission_zone.name})` : ""}` : "outside"}`);
      if (facts.traffic_calming) L.push(`Traffic calming: ${facts.traffic_calming.kind} (${facts.traffic_calming.status ?? ""})`);
      if (facts.pedestrian_zone) L.push("Inside a pedestrian zone.");
      if (facts.chimney_sweep_district) L.push(`Chimney-sweep district (Kehrbezirk): ${facts.chimney_sweep_district}`);
      if (facts.solar_potential?.length)
        L.push(`Rooftop solar (city solar atlas): ${facts.solar_potential.map((s) => `${s.roof_kwp} kWp, ~${s.yield_kwh_per_year.toLocaleString("en")} kWh/year${s.monument_protection ? ` (${s.monument_protection})` : ""}`).join("; ")}`);
      if (stations?.length) L.push(`Nearest stops: ${stations.map((s) => `${s.name} ${fmtDistance(s.distance_m ?? 0)} (${s.transport_types.join(", ")})`).join("; ")}`);
      if (works) {
        const act = works.items.filter((w) => w.active_on_date);
        L.push(act.length ? `Roadworks within 150 m today: ${act.map((w) => `${w.where}: ${w.impact ?? w.kind} until ${w.until}`).join("; ")}` : "Roadworks within 150 m today: none listed.");
      }
      if (mob) L.push(`E-scooters here: ${mob.escooter.verdict}`);
      const near = [fountain, toilet, playground, glass, library].filter((n) => n?.items[0]).map((n) => `${n!.label.split(" (")[0]}: ${n!.items[0].name} (${fmtDistance(n!.items[0].distance_m)})`);
      if (near.length) L.push(`Nearby: ${near.join("; ")}`);
      if (kitas) L.push(`Childcare within 500 m: ${kitas.total_in_radius} facilities${kitas.items.length ? ` (nearest: ${kitas.items.map((k) => k.name).join(", ")})` : ""}`);
      if (facts.errors.length) L.push("", `Some layers could not be queried: ${facts.errors.join("; ")}`);

      const cits = [...facts.citations, loc.citation, wohnlage?.citation, works?.citation, mob?.citation, fountain?.citation, kitas?.citation];
      const markers = [
        ...(stations ?? []).map((s) => ({ lat: s.lat, lon: s.lon, label: s.name, sublabel: `${s.transport_types.join(", ")} · ${fmtDistance(s.distance_m ?? 0)}`, color: "#1864ab" })),
        ...[fountain, toilet, playground, glass, library, kitas].flatMap((n) => (n?.items ?? []).map((p) => ({ lat: p.lat, lon: p.lon, label: p.name, sublabel: `${n!.label.split(" (")[0]} · ${fmtDistance(p.distance_m)}`, color: "#2b8a3e" }))),
      ];
      const cards = [
        facts.district && { title: "District", lines: [`${facts.district.number} ${facts.district.name}`, facts.district.district_part ? `Bezirksteil ${facts.district.district_part}` : ""] },
        { title: "Zoning plan", lines: facts.zoning_plans.length ? facts.zoning_plans.map((p) => `${p.kind.split(" (")[0]} ${p.plan_number}`) : ["None (§34 BauGB)"], links: facts.zoning_plans.flatMap((p) => [p.plan_pdf && { label: `Plan ${p.plan_number}`, href: p.plan_pdf }, p.text_pdf && { label: `Text ${p.plan_number}`, href: p.text_pdf }]).filter(Boolean) },
        { title: "Milieuschutz", tone: facts.milieuschutz ? "warn" : undefined, lines: [facts.milieuschutz ? `Yes: ${facts.milieuschutz.area}` : "No"], links: facts.milieuschutz?.statute_pdf ? [{ label: "Statute", href: facts.milieuschutz.statute_pdf }] : [] },
        wohnlage && { title: "Mietspiegel location", lines: [wohnlage.label] },
        { title: "Resident parking", lines: [facts.resident_parking ? facts.resident_parking.area : "No licence area"] },
        facts.solar_potential?.[0] && { title: "Rooftop solar", lines: [`${facts.solar_potential[0].roof_kwp} kWp`, `~${facts.solar_potential[0].yield_kwh_per_year.toLocaleString("en")} kWh/yr`] },
        mob && { title: "E-scooter parking", tone: mob.escooter.parking_prohibited.length || mob.escooter.must_use_designated_area ? "bad" : "good", lines: [mob.escooter.parking_prohibited.length ? "Prohibited here" : mob.escooter.must_use_designated_area ? "Use the nearby parking area" : mob.escooter.on_designated_area ? "Designated area" : "Not a no-parking zone"] },
      ].filter(Boolean);

      return {
        text: L.join("\n") + citationsMd(cits),
        data: { location: loc, facts, wohnlage, nearest_stops: stations, roadworks_today: works?.items.filter((w) => w.active_on_date), escooter: mob?.escooter.verdict, nearby: { fountain: fountain?.items[0], toilet: toilet?.items[0], playground: playground?.items[0], glass_container: glass?.items[0], library: library?.items[0], kitas_500m: kitas?.total_in_radius }, sources: cits.filter(Boolean) },
        view: { kind: "map", title: "Address report", subtitle: loc.label, center: loc, zoom: 16, origin: { lat: loc.lat, lon: loc.lon, label: loc.label }, cards, markers, attribution: "Landeshauptstadt München" },
      };
    },
  );
}

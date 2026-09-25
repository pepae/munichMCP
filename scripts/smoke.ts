/**
 * End-to-end smoke test over the real MCP protocol.
 *   npm run smoke                      # against http://localhost:8420/mcp
 *   npm run smoke -- https://munichmcp.duckdns.org/mcp
 * Calls each tool with a realistic question and checks the result shape.
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.argv[2] ?? process.env.MCP_URL ?? "http://localhost:8420/mcp";
const only = process.argv[3];

interface Case {
  tool: string;
  args: Record<string, unknown>;
  expect: RegExp;
  view?: string;
}

const CASES: Case[] = [
  { tool: "find_address", args: { query: "Marienplatz 8" }, expect: /Marienplatz 8/ },
  { tool: "address_report", args: { address: "Lindwurmstraße 7" }, expect: /District: 0?2/, view: "map" },
  { tool: "address_report", args: { address: "Wörthstraße 10" }, expect: /Milieuschutz: YES/, view: "map" },
  { tool: "find_nearby", args: { category: "drinking_fountain", address: "Viktualienmarkt", radius_m: 1500 }, expect: /Trinkbrunnen|brunnen/i, view: "map" },
  { tool: "find_nearby", args: { category: "kita", address: "Leopoldstraße 50", radius_m: 800 }, expect: /Childcare/, view: "map" },
  { tool: "find_nearby", args: { category: "park_and_ride", lat: 48.1, lon: 11.52, radius_m: 5000 }, expect: /P\+R/, view: "map" },
  { tool: "roadworks_near", args: { address: "Leopoldstraße 50", radius_m: 500 }, expect: /roadworks/i, view: "map" },
  { tool: "mobility_rules_at", args: { address: "Odeonsplatz" }, expect: /E-scooters:/, view: "map" },
  { tool: "departures", args: { station: "Sendlinger Tor", transport_types: ["UBAHN"] }, expect: /Departures at Sendlinger Tor/, view: "departures" },
  { tool: "plan_trip", args: { from: "Wörthstraße 10", to: "Leopoldstraße 24" }, expect: /Connections from/, view: "map" },
  { tool: "find_nearby", args: { category: "bike_sharing", address: "Marienplatz", radius_m: 600 }, expect: /MyRadl/, view: "map" },
  { tool: "nearby_stops", args: { address: "Rosenheimer Straße 5" }, expect: /Stops near/ },
  { tool: "transit_disruptions", args: { type: "ALL", limit: 3 }, expect: /messages/ },
  { tool: "search_city_services", args: { query: "Wohnsitz anmelden" }, expect: /stadt\.muenchen\.de/ },
  { tool: "council_search", args: { query: "Radweg" }, expect: /council item/ },
  { tool: "estimate_rent", args: { address: "Wörthstraße 10", living_area_m2: 70, year_built: 1965 }, expect: /all six classes/i, view: "form" },
  { tool: "estimate_rent", args: { address: "Wörthstraße 10", living_area_m2: 70, year_built: 1965, wohnlage: "zentral_gut", floor: "guter_boden", balcony_or_terrace: true, current_rent_eur: 1540 }, expect: /Average local comparative rent/, view: "form" },
  { tool: "damage_reports_near", args: { address: "Leopoldstraße 50", radius_m: 1500 }, expect: /citizen report/, view: "map" },
  { tool: "isar_conditions", args: {}, expect: /Isar/ },
  { tool: "weather_air_pollen", args: {}, expect: /Weather/i },
  { tool: "find_statistics", args: { query: "Arbeitslose" }, expect: /Indikatorenatlas/i },
  { tool: "district_stats", args: { dataset: "Einpersonenhaushalte", address: "Wörthstraße 10" }, expect: /All districts/, view: "bars" },
  { tool: "district_stats", args: { dataset: "monatszahlen-verkehrsunfaelle" }, expect: /Verkehrsunfälle/, view: "bars" },
  { tool: "wiki_search", args: { query: "Anmeldung" }, expect: /wiki page/ },
  { tool: "wiki_read", args: { page: "overview" }, expect: /Overview/, view: "wiki" },
  { tool: "wiki_index", args: {}, expect: /pages/ },
  { tool: "about_munichmcp", args: {}, expect: /unofficial/ },
];

const client = new Client({ name: "munichmcp-smoke", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
const { tools } = await client.listTools();
const names = new Set(tools.map((t) => t.name));
console.log(`Connected to ${url}: ${tools.length} tools`);

let failed = 0;
for (const c of CASES) {
  if (only && c.tool !== only) continue;
  if (!names.has(c.tool)) {
    console.log(`SKIP ${c.tool} (not registered)`);
    continue;
  }
  const t0 = Date.now();
  try {
    const r: any = await client.callTool({ name: c.tool, arguments: c.args });
    const text = (r.content ?? []).map((x: any) => x.text ?? "").join("\n");
    const view = r._meta?.["munichmcp/view"]?.kind;
    const ok = !r.isError && c.expect.test(text) && (!c.view || view === c.view);
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${c.tool} ${JSON.stringify(c.args)} ${Date.now() - t0}ms${c.view ? ` view=${view}` : ""}`);
    if (!ok || process.env.VERBOSE) console.log(`  ${text.slice(0, process.env.VERBOSE ? 3000 : 600).replace(/\n/g, "\n  ")}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${c.tool} threw: ${String(e)}`);
  }
}
await client.close();
console.log(failed ? `\n${failed} case(s) failed` : "\nAll cases passed");
process.exit(failed ? 1 : 0);

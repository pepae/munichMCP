import { Client, StreamableHTTPClientTransport, type Tool } from "@modelcontextprotocol/client";
import { AppBridge, PostMessageTransport, getToolUiResourceUri } from "@modelcontextprotocol/ext-apps/app-bridge";

/**
 * Minimal MCP Apps host for testing and demos. Connects to this server's /mcp
 * endpoint, lists tools, calls one, and renders its ui:// view in an iframe via
 * the official AppBridge (the same protocol ChatGPT and Claude use).
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status"), toolSel = $<HTMLSelectElement>("tool"), argsEl = $<HTMLTextAreaElement>("args");
const outEl = $("out"), frame = $<HTMLIFrameElement>("view"), descEl = $("desc");

const EXAMPLES: { label: string; tool: string; args: Record<string, unknown> }[] = [
  { label: "Address report: Lindwurmstraße 7", tool: "address_report", args: { address: "Lindwurmstraße 7" } },
  { label: "Live departures: Sendlinger Tor (U-Bahn)", tool: "departures", args: { station: "Sendlinger Tor", transport_types: ["UBAHN"] } },
  { label: "Can I park my e-scooter at Odeonsplatz?", tool: "mobility_rules_at", args: { address: "Odeonsplatz" } },
  { label: "Drinking fountains near Viktualienmarkt", tool: "find_nearby", args: { category: "drinking_fountain", address: "Viktualienmarkt", radius_m: 1500 } },
  { label: "Roadworks near Leopoldstraße 50", tool: "roadworks_near", args: { address: "Leopoldstraße 50", radius_m: 400 } },
  { label: "Rent check: 70 m², built 1965, Haidhausen", tool: "estimate_rent", args: { address: "Wörthstraße 10", living_area_m2: 70, year_built: 1965, current_rent_eur: 1540 } },
  { label: "Isar conditions today", tool: "isar_conditions", args: {} },
  { label: "Wiki: overview", tool: "wiki_read", args: { page: "overview" } },
  { label: "City service: register residence", tool: "search_city_services", args: { query: "Wohnsitz anmelden" } },
  { label: "Council motions about bikes", tool: "council_search", args: { query: "Radweg" } },
];

let client: Client;
const tools = new Map<string, Tool>();
let bridge: AppBridge | undefined;

async function connect() {
  client = new Client({ name: "munichMCP playground", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", location.origin)));
  const list = await client.listTools();
  for (const t of list.tools) tools.set(t.name, t);
  toolSel.innerHTML = list.tools.map((t) => `<option value="${t.name}">${t.name}${getToolUiResourceUri(t) ? " ◧" : ""}</option>`).join("");
  statusEl.textContent = `Connected: ${list.tools.length} tools (◧ = has interactive view)`;
  showDesc();
  const ex = $("examples");
  for (const e of EXAMPLES) {
    const b = document.createElement("button");
    b.textContent = e.label;
    b.onclick = () => {
      toolSel.value = e.tool;
      argsEl.value = JSON.stringify(e.args, null, 2);
      showDesc();
      run();
    };
    ex.append(b);
  }
  const first = EXAMPLES[0];
  toolSel.value = first.tool;
  argsEl.value = JSON.stringify(first.args, null, 2);
  showDesc();
}

function showDesc() {
  descEl.textContent = tools.get(toolSel.value)?.description?.slice(0, 400) ?? "";
}
toolSel.onchange = showDesc;

async function run() {
  const name = toolSel.value;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsEl.value || "{}");
  } catch {
    outEl.textContent = "Arguments are not valid JSON.";
    return;
  }
  outEl.textContent = "Calling…";
  const tool = tools.get(name)!;
  const uri = getToolUiResourceUri(tool);
  const resultP = client.callTool({ name, arguments: args });
  if (uri) await mountView(uri, args, resultP);
  else frame.style.display = "none";
  try {
    const result: any = await resultP;
    outEl.textContent = (result.content ?? []).map((c: any) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n\n");
  } catch (e) {
    outEl.textContent = `Error: ${String(e)}`;
  }
}
$("run").onclick = run;

async function mountView(uri: string, args: Record<string, unknown>, resultP: Promise<any>) {
  frame.style.display = "block";
  const res = await client.readResource({ uri });
  const content: any = res.contents[0];
  const html = "blob" in content ? atob(content.blob) : content.text;
  if (bridge) {
    const old = bridge;
    bridge = undefined;
    await Promise.race([old.teardownResource({}).catch(() => undefined), new Promise((r) => setTimeout(r, 500))]);
    await old.close().catch(() => undefined);
  }
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  bridge = new AppBridge(
    client,
    { name: "munichMCP playground", version: "0.1.0" },
    { openLinks: {}, serverTools: {}, serverResources: {}, logging: {} },
    { hostContext: { theme: dark ? "dark" : "light", displayMode: "inline", platform: "web" } as any },
  );
  bridge.onopenlink = async ({ url }) => {
    window.open(url, "_blank", "noopener");
    return {};
  };
  bridge.onloggingmessage = (m) => console.log("[view log]", m.level, m.data);
  bridge.onsizechange = ({ height }) => {
    if (height) frame.style.height = `${Math.min(Math.max(height, 120), 1600)}px`;
  };
  const initialized = new Promise<void>((resolve) => (bridge!.oninitialized = () => resolve()));
  // Listen before the view loads: it sends ui/initialize as soon as its script runs.
  // (The iframe's WindowProxy stays the same object across srcdoc navigations.)
  const current = bridge;
  await current.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
  frame.srcdoc = html;
  await initialized;
  current.sendToolInput({ arguments: args });
  resultP.then(
    (r) => current.sendToolResult(r),
    (e) => current.sendToolCancelled({ reason: String(e) }),
  );
}

connect().catch((e) => (statusEl.textContent = `Connection failed: ${String(e)}`));

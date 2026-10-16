import { marked } from "marked";
import { config } from "./config.js";
import { catalog } from "./catalog/catalog.js";
import type { HealthReport } from "./catalog/health.js";
import type { Proposal } from "./catalog/proposals.js";
import type { Collection, Contribution, communityStats } from "./community/contributions.js";
import { SOURCES } from "./lib/sources.js";
import { outsideCode, wiki } from "./sources/wiki.js";

/** Small server-rendered pages: landing page and a human-browsable wiki. */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d2433;--muted:#5b6475;--line:#e4e1d8;--accent:#0b5cad;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e8eaf0;--muted:#a3abbb;--line:#2a303c;--accent:#7cb4ff;--card:#181c25}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 16px 64px}a{color:var(--accent)}h1{font-size:2rem;line-height:1.2;margin:.2em 0}
h2{margin-top:2em;font-size:1.25rem}code,pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}
pre{background:var(--card);border:1px solid var(--line);padding:12px;border-radius:8px;overflow:auto}
.muted{color:var(--muted)}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;font-size:.92rem}
.pill{display:inline-block;font-size:.75rem;padding:1px 8px;border:1px solid var(--line);border-radius:99px;color:var(--muted)}
nav a{margin-right:14px}`;

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body><main>
<nav><a href="/">munichMCP</a><a href="/wiki">Wiki</a><a href="/status">Status</a><a href="/participate">Take part</a><a href="https://github.com/pepae/munichMCP">GitHub</a></nav>${body}
<p class="muted" style="margin-top:48px">Unofficial project, not affiliated with the Landeshauptstadt München. Data from the sources listed, under their licences.</p>
</main></body></html>`;
}

export function renderLanding(): string {
  const rows = Object.values(SOURCES)
    .map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.publisher)}</td><td>${esc(s.license)}</td></tr>`)
    .join("");
  return layout(
    "munichMCP",
    `<h1>munichMCP</h1>
<p>An unofficial <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server that gives AI assistants (ChatGPT, Claude, MUCGPT, any MCP client) live, cited access to Munich's open data: addresses and zoning, noise and flood risk, live departures, city services, the official rent index, election results, the city budget, council motions and residents' assemblies, roadworks, the Isar, micromobility rules, statistics, facilities, and an agent-maintained wiki.</p>
<div class="card"><strong>MCP endpoint</strong><pre>${esc(config.publicUrl)}/mcp</pre>
<span class="muted">Streamable HTTP, no authentication. Reads open data; the only writes are reviewed contributions (data reports, community data, source proposals). Interactive views via MCP Apps (maps, departure boards, rent calculator, wiki).</span></div>
<h2>Connect</h2>
<p><strong>ChatGPT:</strong> Settings, Apps &amp; Connectors, Advanced, enable developer mode, then Create connector with the URL above.<br>
<strong>Claude:</strong> Settings, Connectors, Add custom connector, paste the URL.<br>
<strong>Claude Code:</strong> <code>claude mcp add --transport http munichmcp ${esc(config.publicUrl)}/mcp</code></p>
<h2>Try asking</h2><ul>
<li>What applies at Wörthstraße 10? Zoning plan, Milieuschutz, resident parking?</li>
<li>When does the next U-Bahn leave from Sendlinger Tor?</li>
<li>Is €22/m² legal for my 70 m² flat from 1965 in Haidhausen?</li>
<li>Can I park my e-scooter at Odeonsplatz?</li>
<li>Can I swim in the Isar at the Flaucher today?</li>
<li>What do I need to register my new address, and can I do it online?</li></ul>
<h2>Data sources</h2><p>Every source is described in a manifest and checked automatically; see the <a href="/status">status page</a>. Suggest a new one with the <code>propose_data_source</code> tool or a GitHub issue.</p><table><tr><th>Source</th><th>Publisher</th><th>Licence</th></tr>${rows}</table>
<h2>Take part</h2><p>munichMCP is also a small database of its own: through any assistant, residents can report wrong or missing data, record accessibility barriers or ideas for a place, and propose new sources. A person reviews every contribution before it is published as open data (CC0). See <a href="/participate">Take part</a>.</p>
<h2>Wiki</h2><p>The <a href="/wiki">munichMCP wiki</a> (${wiki.size} pages) is a cross-linked Markdown knowledge base compiled by maintainer agents from primary sources and refreshed continuously.</p>`,
  );
}

function renderMarkdown(md: string): string {
  // Escape raw HTML, then turn [[slug|label]] links into wiki links.
  const safe = md.replace(/</g, "&lt;");
  const linked = outsideCode(safe, (text) =>
    text.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, slug: string, label?: string) => {
      const p = wiki.resolve(slug);
      const href = `/wiki/${encodeURI(p?.slug ?? slug.trim())}`;
      return `[${(label ?? p?.title ?? slug).trim()}](${href}${p ? "" : ' "missing page"'})`;
    }),
  );
  return marked.parse(linked, { async: false }) as string;
}

export function renderWikiPage(slug: string): string | undefined {
  const r = wiki.read(slug);
  if (!r) return undefined;
  const p = r.page;
  const sources = p.sources.length ? `<h2>Sources</h2><ul>${p.sources.map((s) => `<li>${/^https?:/.test(s) ? `<a href="${esc(s)}">${esc(s)}</a>` : esc(s)}</li>`).join("")}</ul>` : "";
  const back = r.backlinks.length ? `<h2>Linked from</h2><p>${r.backlinks.map((b) => `<a href="/wiki/${esc(b.slug)}">${esc(b.title)}</a>`).join(", ")}</p>` : "";
  return layout(
    `${p.title} | munichMCP wiki`,
    `<p><span class="pill">${esc(p.type)}</span> ${p.updated ? `<span class="muted">updated ${esc(p.updated)}</span>` : ""} ${p.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join(" ")}</p>
<article>${renderMarkdown(p.body)}</article>${sources}${back}`,
  );
}

export function renderWikiIndex(notice?: string): string {
  const pages = wiki.list();
  const groups = new Map<string, typeof pages>();
  for (const p of pages) groups.set(p.type, [...(groups.get(p.type) ?? []), p]);
  const body = [...groups.entries()]
    .map(([t, ps]) => `<h2>${esc(t)}</h2><ul>${ps.map((p) => `<li><a href="/wiki/${esc(p.slug)}">${esc(p.title)}</a>${p.summary ? ` <span class="muted">${esc(p.summary)}</span>` : ""}</li>`).join("")}</ul>`)
    .join("");
  return layout("munichMCP wiki", `<h1>munichMCP wiki</h1>${notice ? `<p class="card">${esc(notice)}</p>` : ""}<p class="muted">${pages.length} pages, maintained by agents from primary sources. Start with <a href="/wiki/overview">Overview</a>.</p>${body}`);
}


const DOT: Record<string, string> = { ok: "#2b8a3e", degraded: "#b35c00", failing: "#c92a2a" };

/** Public status page: health of every catalog source, from the latest automatic checks. */
export function renderStatus(report: HealthReport | undefined, proposals: Proposal[], issuesBySource: Record<string, number> = {}): string {
  const health = new Map(report?.sources.map((s) => [s.id, s]) ?? []);
  const rank = (id: string) => ({ failing: 0, degraded: 1, ok: 2 })[health.get(id)?.status ?? "ok"] ?? 3;
  const rows = [...catalog]
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
    .map((m) => {
      const h = health.get(m.id);
      const failed = h?.checks.filter((c) => !c.ok) ?? [];
      const state = h ? `<span style="color:${DOT[h.status]};font-weight:600">${h.status}</span>` : `<span class="muted">not checked</span>`;
      return `<tr><td><strong>${esc(m.name)}</strong><br><span class="muted">${esc(m.publisher)}, ${esc(m.licence)}</span></td><td>${state}</td><td>${h ? `${h.checks.filter((c) => c.ok).length}/${h.checks.length}` : ""}${failed.length ? `<br><span class="muted">${failed.map((c) => esc(`${c.name}: ${c.detail}`)).join("<br>")}</span>` : ""}</td><td>${m.implementation.kind === "code" ? "code" : `<span class="pill">YAML only</span>`}</td><td>${issuesBySource[m.id] ? `<a href="/participate#reports">${issuesBySource[m.id]} open</a>` : `<span class="muted">none</span>`}</td></tr>`;
    })
    .join("");
  const open = proposals.filter((p) => p.status === "new" || p.status === "in_progress" || p.status === "pr_opened");
  return layout(
    "Status | munichMCP",
    `<h1>Data source status</h1>
<p class="muted">${report ? `Checked ${esc(report.checked_at.slice(0, 16).replace("T", " "))} UTC: ${report.summary.ok} ok, ${report.summary.degraded} degraded, ${report.summary.failing} failing.` : "No check has run yet."} Checks run daily without any AI: is the source reachable, has its licence or schema changed, is it fresh, and do known questions still get the known answers. A weekly agent turns failures into repair pull requests that a maintainer approves.</p>
<table><tr><th>Source</th><th>Health</th><th>Checks</th><th>Integration</th><th>Reports</th></tr>${rows}</table>
<h2>Proposed sources</h2>
${open.length ? `<table><tr><th>Proposal</th><th>Status</th><th>Received</th></tr>${open.map((p) => `<tr><td>${esc(p.name)}<br><span class="muted">${esc(p.url)}</span></td><td>${esc(p.status)}${p.pr_url ? `<br><a href="${esc(p.pr_url)}">pull request</a>` : ""}</td><td>${esc(p.created.slice(0, 10))}</td></tr>`).join("")}</table>` : `<p class="muted">No open proposals.</p>`}
<p>Propose a source with the <code>propose_data_source</code> tool from any connected assistant, or open a "New data source" issue on GitHub. Never send API keys: say whether a source needs one and a maintainer arranges it through the deployment's secret store.</p>
<p class="muted">Machine-readable: <a href="/status.json">/status.json</a></p>`,
  );
}

type CommunityStats = Awaited<ReturnType<typeof communityStats>>;

/** Public page on taking part: the ladder from using to shaping, collections, reports, recent contributions. */
export function renderParticipate(collections: Collection[], stats: CommunityStats, recent: Contribution[], reports: Contribution[]): string {
  const steps: [string, string, string][] = [
    ["Use", "Ask about your street, your rent, your next bus, an office visit.", "address_report, departures, get_city_service, ..."],
    ["Understand", "See where answers come from and how the city works: sources, council, budget, elections.", "data_sources, wiki_search, council_search, city_budget"],
    ["Give feedback", "Something is wrong, outdated or missing? Report it; it is routed to whoever maintains the source.", "report_data_issue"],
    ["Contribute", "Add what the city does not know yet: barriers, ideas for a place, new kinds of data, new sources.", "contribute_data, propose_data_source"],
    ["Shape", "Take part in the city itself: residents' assemblies, council matters, participation procedures.", "citizens_assemblies, council_search"],
  ];
  const ladder = steps.map(([t, d, tools], i) => `<tr><td><strong>${i + 1}. ${t}</strong></td><td>${esc(d)}<br><span class="muted"><code>${esc(tools)}</code></span></td></tr>`).join("");
  const cols = collections
    .map((c) => `<tr><td><strong>${esc(c.label)}</strong><br><span class="muted"><code>${esc(c.id)}</code></span></td><td>${esc(c.description)}${c.official ? `<br><span class="muted">Handed over to <a href="${esc(c.official.url)}">${esc(c.official.name)}</a>; munichMCP keeps no copy.</span>` : ""}</td><td>${c.official ? "" : `${stats.by_collection[c.id]?.published ?? 0} published<br><span class="muted">${stats.by_collection[c.id]?.pending ?? 0} in review</span>`}</td></tr>`)
    .join("");
  const items = recent.map((c) => `<li><strong>${esc(c.title)}</strong> <span class="pill">${esc(c.collection ?? "")}</span>${c.place ? ` <span class="muted">${esc(c.place)}</span>` : ""}${c.confirmations ? ` <span class="muted">+${c.confirmations}</span>` : ""}</li>`).join("");
  const open = reports.map((c) => `<tr><td>${esc(c.title)}<br><span class="muted">${esc(c.source_id ?? c.tool ?? "")}, ${esc(c.issue_type ?? "")}</span></td><td>${esc(c.status)}${c.confirmations ? ` (+${c.confirmations})` : ""}</td><td>${esc(c.created.slice(0, 10))}</td></tr>`).join("");
  return layout(
    "Take part | munichMCP",
    `<h1>Take part</h1>
<p>munichMCP starts as a service: people ask, and their assistant answers with the city's data. The more people use it, the more they should be able to give back. Every step below works from any assistant connected to munichMCP.</p>
<table>${ladder}</table>
<h2>How contributions are handled</h2>
<p>Automatic checks first: the place must be in Munich, the text must not contain personal data or credentials, and a report of the same thing nearby counts as a confirmation instead of a duplicate. Then a person reviews it. Published records are open data under <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a>. Where the city already runs a channel, munichMCP hands over instead of keeping a copy.</p>
<p class="muted">${stats.records_published} records published, ${stats.records_pending} in review, ${stats.issues_open} open data reports, ${stats.issues_resolved} resolved.</p>
<h2>Collections</h2><table><tr><th>Collection</th><th>What belongs here</th><th>Entries</th></tr>${cols}</table>
<p>Any other kind of data can be proposed by using a new collection name with <code>contribute_data</code>; a maintainer decides whether to open it.</p>
<h2>Recently published</h2>${items ? `<ul>${items}</ul>` : `<p class="muted">Nothing published yet.</p>`}
<h2 id="reports">Open data reports</h2>${open ? `<table><tr><th>Report</th><th>Status</th><th>Received</th></tr>${open}</table>` : `<p class="muted">No open reports.</p>`}
<p class="muted">Open export: <a href="/community.geojson">/community.geojson</a> (CC0 1.0). Track a contribution with the <code>contribution_status</code> tool.</p>`,
  );
}

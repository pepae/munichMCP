import { marked } from "marked";
import { config } from "./config.js";
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
<nav><a href="/">munichMCP</a><a href="/wiki">Wiki</a><a href="https://github.com/pepae/munichMCP">GitHub</a></nav>${body}
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
<p>An unofficial <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server that gives AI assistants (ChatGPT, Claude, MUCGPT, any MCP client) live, cited access to Munich's open data: addresses and zoning, live departures, city services, the official rent index, council motions, roadworks, the Isar, micromobility rules, statistics, facilities, and an agent-maintained wiki.</p>
<div class="card"><strong>MCP endpoint</strong><pre>${esc(config.publicUrl)}/mcp</pre>
<span class="muted">Streamable HTTP, no authentication, read-only. Interactive views via MCP Apps (maps, departure boards, rent calculator, wiki).</span></div>
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
<h2>Data sources</h2><table><tr><th>Source</th><th>Publisher</th><th>Licence</th></tr>${rows}</table>
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
  const back = r.backlinks.length ? `<h2>Linked from</h2><p>${r.backlinks.map((b) => `<a href="/wiki/${esc(b.slug)}">${esc(b.title)}</a>`).join(" · ")}</p>` : "";
  return layout(
    `${p.title} · munichMCP wiki`,
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

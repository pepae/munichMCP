import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { config } from "../config.js";
import { cite } from "../lib/sources.js";
import { runCollector } from "../sources/wiki-collector.js";
import { PAGE_TYPES, wiki } from "../sources/wiki.js";
import { citationsMd, defineTool } from "./util.js";

const wikiUrl = (slug: string) => `${config.publicUrl}/wiki/${slug}`;

export function registerWikiReadTools(server: McpServer) {
  defineTool(
    server,
    "wiki_search",
    {
      title: "Search the munichMCP wiki",
      description:
        "Full-text search over the munichMCP wiki: an agent-maintained, cross-linked Markdown knowledge base about Munich (city services explained, " +
        "districts, current council topics, how-tos, recent changes), refreshed daily/weekly from primary sources such as council motions, press releases and new open datasets. " +
        "Use it for background and context that raw datasets do not explain; every page cites its sources. German and English queries work.",
      input: z.object({ query: z.string().min(2).max(200), limit: z.number().int().min(1).max(20).default(8) }),
    },
    async ({ query, limit }) => {
      const hits = wiki.search(query, limit);
      const text =
        `${hits.length} wiki page(s) for "${query}":\n\n` +
        hits.map((h, i) => `${i + 1}. [[${h.slug}]] ${h.title} (${h.type}${h.updated ? `, updated ${h.updated}` : ""})\n   ${h.summary ?? h.snippet}`).join("\n") +
        (hits.length ? "\n\nUse wiki_read with a slug to open a page." : "\nNothing found; try other words or wiki_index.") +
        citationsMd([cite("wiki", wiki.loadedAt)]);
      return { text, data: { query, results: hits } };
    },
  );

  defineTool(
    server,
    "wiki_read",
    {
      title: "Read a munichMCP wiki page",
      description:
        "Open one page of the munichMCP wiki by slug (e.g. 'topics/anmeldung', 'entities/kvr', 'overview') with its Markdown body, sources, outgoing [[links]] and backlinks, and render it as a navigable page.",
      input: z.object({ page: z.string().min(1).max(160).describe("Page slug or exact title; 'overview' and 'index' are good entry points") }),
      ui: true,
    },
    async ({ page }) => {
      const r = wiki.read(page);
      if (!r) {
        const alt = wiki.search(page, 5);
        throw new Error(`No wiki page "${page}".${alt.length ? ` Did you mean: ${alt.map((a) => a.slug).join(", ")}?` : ""}`);
      }
      const p = r.page;
      const text =
        `# ${p.title}\n(slug: ${p.slug}; type: ${p.type}${p.updated ? `; updated ${p.updated}` : ""}; ${wikiUrl(p.slug)})\n\n${p.body.trim()}\n\n` +
        (p.sources.length ? `Page sources:\n${p.sources.map((s) => `- ${s}`).join("\n")}\n` : "") +
        (r.backlinks.length ? `\nLinked from: ${r.backlinks.map((b) => b.slug).join(", ")}` : "") +
        citationsMd([cite("wiki", wiki.loadedAt)]);
      return {
        text,
        data: { slug: p.slug, title: p.title, type: p.type, updated: p.updated, sources: p.sources, tags: p.tags, outgoing: r.outgoing, backlinks: r.backlinks, url: wikiUrl(p.slug) },
        view: { kind: "wiki", slug: p.slug, title: p.title, type: p.type, updated: p.updated, body: p.body, sources: p.sources, tags: p.tags, outgoing: r.outgoing, backlinks: r.backlinks, url: wikiUrl(p.slug) },
      };
    },
  );

  defineTool(
    server,
    "wiki_index",
    {
      title: "munichMCP wiki index",
      description: "List all munichMCP wiki pages grouped by type (overview, topic, entity, source, query), with summaries and last-update dates, plus recent change history.",
      input: z.object({}),
    },
    async () => {
      const pages = wiki.list();
      const byType = new Map<string, typeof pages>();
      for (const p of pages) byType.set(p.type, [...(byType.get(p.type) ?? []), p]);
      const hist = await wiki.history(8);
      const text =
        `munichMCP wiki: ${pages.length} pages.\n\n` +
        [...byType.entries()].map(([t, ps]) => `## ${t}\n${ps.map((p) => `- [[${p.slug}]] ${p.title}${p.summary ? `: ${p.summary}` : ""}`).join("\n")}`).join("\n\n") +
        (hist.length ? `\n\nRecent changes:\n${hist.map((h) => `- ${h}`).join("\n")}` : "");
      return { text, data: { pages, recent_changes: hist } };
    },
  );
}

/** Write tools, only exposed on the token-protected maintainer endpoint. */
export function registerWikiMaintainerTools(server: McpServer) {
  const w = { readOnlyHint: false, idempotentHint: false, openWorldHint: false };

  defineTool(
    server,
    "wiki_inbox",
    {
      title: "List raw inbox items",
      description: "List raw source captures waiting to be compiled into wiki pages (status 'new'), newest first. Raw items are immutable source text: council motions, press releases, new datasets.",
      input: z.object({ status: z.enum(["new", "ingested", "skipped", "all"]).default("new"), limit: z.number().int().min(1).max(100).default(25) }),
    },
    async ({ status, limit }) => {
      const items = await wiki.listRaw(status, limit);
      return {
        text: `${items.length} raw item(s) with status ${status}:\n\n` + items.map((i) => `- ${i.id} [${i.source}] ${i.title} (${i.published ?? i.fetched})${i.url ? ` ${i.url}` : ""}`).join("\n"),
        data: { items: items.map(({ body, file: _f, ...rest }) => ({ ...rest, preview: body.slice(0, 400) })) },
      };
    },
  );

  defineTool(
    server,
    "wiki_read_raw",
    { title: "Read raw inbox items", description: "Read the full text of raw inbox items by id.", input: z.object({ ids: z.array(z.string()).min(1).max(20) }) },
    async ({ ids }) => {
      const all = await wiki.listRaw("all", 5000);
      const items = all.filter((i) => ids.includes(i.id));
      return {
        text: items.map((i) => `## ${i.title}\nid: ${i.id} | source: ${i.source} | published: ${i.published ?? "?"} | status: ${i.status}\n${i.url ?? ""}\n\n${i.body}`).join("\n\n---\n\n") || "No such items.",
        data: { items: items.map(({ file: _f, ...rest }) => rest) },
      };
    },
  );

  defineTool(
    server,
    "wiki_write_page",
    {
      title: "Create or update a wiki page",
      description:
        "Create or overwrite a wiki page (full Markdown body, no frontmatter; the server writes frontmatter). Follow SCHEMA.md: cite sources (URLs) in `sources`, link related pages with [[slug]], keep index.md and overview.md current. Every write is logged and committed to git.",
      input: z.object({
        slug: z.string().min(2).max(120).describe("e.g. topics/wohnungssuche, entities/stadtrat, queries/2026-10-anwohnerparken-haidhausen"),
        title: z.string().min(2).max(160),
        type: z.enum(PAGE_TYPES),
        summary: z.string().max(300).optional(),
        tags: z.array(z.string().max(40)).max(12).optional(),
        sources: z.array(z.string().max(400)).max(40).optional().describe("Primary source URLs this page is based on"),
        body: z.string().min(10).max(60_000),
        reason: z.string().min(3).max(200).describe("Short change note for the log"),
        author: z.string().max(60).default("maintainer-agent"),
      }),
      annotations: w,
    },
    async (a) => {
      const r = await wiki.writePage({ ...a, author: a.author });
      return {
        text: `${r.created ? "Created" : "Updated"} [[${r.slug}]].${r.broken_links.length ? ` Broken links to fix: ${r.broken_links.join(", ")}` : ""}`,
        data: r,
      };
    },
  );

  defineTool(
    server,
    "wiki_mark_raw",
    {
      title: "Mark raw items processed",
      description: "Mark raw inbox items as ingested (compiled into pages) or skipped (irrelevant), with an optional note.",
      input: z.object({ ids: z.array(z.string()).min(1).max(100), status: z.enum(["ingested", "skipped"]), note: z.string().max(300).optional(), author: z.string().max(60).default("maintainer-agent") }),
      annotations: w,
    },
    async ({ ids, status, note, author }) => {
      const n = await wiki.setRawStatus(ids, status, author, note);
      return { text: `Marked ${n} item(s) as ${status}.`, data: { updated: n } };
    },
  );

  defineTool(
    server,
    "wiki_archive_page",
    {
      title: "Archive a wiki page",
      description: "Move an obsolete page to archive/ (recoverable via git). Fix links pointing to it afterwards.",
      input: z.object({ slug: z.string(), reason: z.string().min(3).max(200), author: z.string().max(60).default("maintainer-agent") }),
      annotations: { ...w, destructiveHint: true },
    },
    async ({ slug, reason, author }) => {
      await wiki.archivePage(slug, author, reason);
      return { text: `Archived ${slug}.` };
    },
  );

  defineTool(
    server,
    "wiki_lint",
    {
      title: "Lint the wiki",
      description: "Health check: broken [[links]], orphan pages, pages without sources, stale pages (>90 days), pages missing from index.md, and pending raw items.",
      input: z.object({}),
    },
    async () => {
      const r = await wiki.lint();
      return {
        text:
          `Wiki lint: ${r.pages} pages, ${r.raw_pending} raw pending.\n` +
          `Broken links (${r.broken_links.length}): ${r.broken_links.map((b) => `${b.page} -> ${b.link}`).join(", ") || "none"}\n` +
          `Orphans (${r.orphans.length}): ${r.orphans.join(", ") || "none"}\n` +
          `Unsourced (${r.unsourced.length}): ${r.unsourced.join(", ") || "none"}\n` +
          `Stale (${r.stale.length}): ${r.stale.map((s) => s.slug).join(", ") || "none"}\n` +
          `Missing from index (${r.missing_from_index.length}): ${r.missing_from_index.join(", ") || "none"}`,
        data: r,
      };
    },
  );

  defineTool(
    server,
    "wiki_rebuild_index",
    {
      title: "Rebuild index.md",
      description: "Regenerate index.md deterministically from all pages (grouped by type, with summaries). Run after creating or archiving pages.",
      input: z.object({ author: z.string().max(60).default("maintainer-agent") }),
      annotations: w,
    },
    async ({ author }) => {
      const n = await wiki.rebuildIndex(author);
      return { text: `index.md rebuilt (${n} pages).` };
    },
  );

  defineTool(
    server,
    "wiki_log",
    {
      title: "Append to the wiki log",
      description: "Append an entry to log.md (e.g. a summary of an ingest or lint session).",
      input: z.object({ entry: z.string().min(3).max(1000), author: z.string().max(60).default("maintainer-agent") }),
      annotations: w,
    },
    async ({ entry, author }) => {
      await wiki.appendLog(entry, author);
      return { text: "Logged." };
    },
  );

  defineTool(
    server,
    "wiki_collect_now",
    {
      title: "Run the raw collector now",
      description: "Run the deterministic collector (council RSS feeds, press releases, new open datasets) immediately and report how many new raw items arrived.",
      input: z.object({}),
      annotations: { ...w, openWorldHint: true },
    },
    async () => {
      const r = await runCollector();
      return { text: `Collector finished: ${r.added} new raw item(s). ${r.errors.length ? `Errors: ${r.errors.join("; ")}` : ""}`, data: r };
    },
  );
}

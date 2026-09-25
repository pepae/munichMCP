import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import MiniSearch from "minisearch";
import YAML from "yaml";
import { config } from "../config.js";
import { processTerm, snippet } from "../lib/text.js";

/**
 * The munichMCP wiki: a Karpathy-style "LLM wiki". A folder of cross-linked
 * Markdown pages that maintainer agents compile from raw sources:
 *
 *   raw/     immutable captures (council motions, press releases, new datasets)
 *            written by the deterministic collector; status: new | ingested | skipped
 *   pages    topics/, entities/, sources/, queries/ plus index.md, overview.md, log.md
 *   SCHEMA.md  the conventions maintainers follow
 *
 * Public tools read and search it; the token-protected maintainer endpoint
 * lets an agent ingest raw items, write pages, and lint the graph. Every write
 * is committed to a git repository inside the wiki folder (audit trail).
 */

const execFileP = promisify(execFile);

export const PAGE_TYPES = ["overview", "topic", "entity", "source", "query", "meta"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export interface WikiPage {
  slug: string;
  title: string;
  type: PageType | string;
  tags: string[];
  sources: string[];
  updated?: string;
  summary?: string;
  body: string;
  links: string[];
  frontmatter: Record<string, unknown>;
}

export interface RawItem {
  id: string;
  title: string;
  url?: string;
  source: string;
  published?: string;
  fetched: string;
  status: "new" | "ingested" | "skipped";
  body: string;
  file: string;
}

const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
const SLUG_RE = /^[a-z0-9][a-z0-9\-/]*[a-z0-9]$/;

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  let data: Record<string, unknown> = {};
  try {
    data = (YAML.parse(m[1]) as Record<string, unknown>) ?? {};
  } catch {
    data = {};
  }
  return { data, body: text.slice(m[0].length) };
}

/** Apply `fn` only to Markdown outside fenced code blocks and inline code spans. */
export function outsideCode(md: string, fn: (text: string) => string): string {
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

export function extractLinks(body: string): string[] {
  const out = new Set<string>();
  outsideCode(body, (text) => {
    for (const m of text.matchAll(LINK_RE)) out.add(normalizeSlug(m[1]));
    return text;
  });
  return [...out];
}

export function normalizeSlug(s: string): string {
  return s
    .trim()
    .replace(/\.md$/i, "")
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9\-/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

export class WikiStore {
  private pages = new Map<string, WikiPage>();
  private backlinks = new Map<string, Set<string>>();
  private search_ = new MiniSearch<{ id: string; title: string; tags: string; body: string; summary: string }>({
    fields: ["title", "tags", "summary", "body"],
    storeFields: ["title"],
    processTerm: (t) => processTerm(t),
    searchOptions: { boost: { title: 4, tags: 2, summary: 2 }, prefix: true, fuzzy: 0.15, combineWith: "OR" },
  });
  loadedAt = 0;
  private writeLock: Promise<unknown> = Promise.resolve();

  constructor(readonly dir: string) {}

  /** Seed the live wiki from the repo copy on first boot, then load. */
  async init(seedDir?: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    if (seedDir && (await exists(seedDir))) {
      // Copy seed pages that the live wiki does not have yet. Never overwrite:
      // once a page exists, maintainer agents own it (history is in git).
      let added = 0;
      for (const file of await listMarkdown(seedDir)) {
        const rel = path.relative(seedDir, file);
        if (rel.replace(/\\/g, "/").startsWith("raw/")) continue;
        const target = path.join(this.dir, rel);
        if ((await exists(target)) || (await exists(path.join(this.dir, "archive", rel)))) continue;
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(file, target);
        added++;
      }
      if (added) console.log(`[wiki] added ${added} seed page(s) from ${seedDir}`);
    }
    await this.ensureGit();
    await this.load();
  }

  async load(): Promise<void> {
    const files = await listMarkdown(this.dir);
    const pages = new Map<string, WikiPage>();
    for (const file of files) {
      const rel = path.relative(this.dir, file).replace(/\\/g, "/");
      if (rel.startsWith("raw/") || rel.startsWith("archive/")) continue;
      const text = await fs.readFile(file, "utf8");
      const { data, body } = parseFrontmatter(text);
      const slug = normalizeSlug(rel);
      pages.set(slug, {
        slug,
        title: String(data.title ?? firstHeading(body) ?? slug),
        type: String(data.type ?? inferType(slug)),
        tags: asList(data.tags),
        sources: asList(data.sources),
        updated: data.updated ? String(data.updated) : undefined,
        summary: data.summary ? String(data.summary) : undefined,
        body,
        links: extractLinks(body),
        frontmatter: data,
      });
    }
    const backlinks = new Map<string, Set<string>>();
    for (const p of pages.values()) {
      for (const l of p.links) {
        const target = resolveIn(pages, l) ?? l;
        if (!backlinks.has(target)) backlinks.set(target, new Set());
        backlinks.get(target)!.add(p.slug);
      }
    }
    this.pages = pages;
    this.backlinks = backlinks;
    this.search_.removeAll();
    this.search_.addAll(
      [...pages.values()].map((p) => ({ id: p.slug, title: p.title, tags: p.tags.join(" "), summary: p.summary ?? "", body: p.body })),
    );
    this.loadedAt = Date.now();
  }

  get size(): number {
    return this.pages.size;
  }

  resolve(slugOrTitle: string): WikiPage | undefined {
    const key = resolveIn(this.pages, normalizeSlug(slugOrTitle));
    if (key) return this.pages.get(key);
    const lower = slugOrTitle.trim().toLowerCase();
    return [...this.pages.values()].find((p) => p.title.toLowerCase() === lower);
  }

  read(slugOrTitle: string) {
    const p = this.resolve(slugOrTitle);
    if (!p) return undefined;
    const outgoing = p.links.map((l) => {
      const target = resolveIn(this.pages, l);
      return { slug: target ?? l, title: target ? this.pages.get(target)!.title : undefined, exists: Boolean(target) };
    });
    const back = [...(this.backlinks.get(p.slug) ?? [])].map((s) => ({ slug: s, title: this.pages.get(s)?.title ?? s }));
    return { page: p, outgoing, backlinks: back };
  }

  search(query: string, limit = 8) {
    return this.search_
      .search(query)
      .slice(0, limit)
      .map((r) => {
        const p = this.pages.get(String(r.id))!;
        return { slug: p.slug, title: p.title, type: p.type, updated: p.updated, summary: p.summary, snippet: snippet(p.body, query, 240), score: Math.round(r.score * 10) / 10 };
      });
  }

  list() {
    return [...this.pages.values()]
      .sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title))
      .map((p) => ({ slug: p.slug, title: p.title, type: p.type, updated: p.updated, summary: p.summary, backlinks: this.backlinks.get(p.slug)?.size ?? 0 }));
  }

  graph() {
    const nodes = [...this.pages.values()].map((p) => ({ id: p.slug, title: p.title, type: p.type }));
    const edges: { from: string; to: string }[] = [];
    for (const p of this.pages.values()) for (const l of p.links) {
      const t = resolveIn(this.pages, l);
      if (t) edges.push({ from: p.slug, to: t });
    }
    return { nodes, edges };
  }

  // ---------------------------------------------------------------- writes

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeLock.then(fn, fn);
    this.writeLock = run.catch(() => undefined);
    return run;
  }

  async writePage(input: {
    slug: string;
    title: string;
    type: string;
    body: string;
    summary?: string;
    tags?: string[];
    sources?: string[];
    author: string;
    reason: string;
  }): Promise<{ slug: string; created: boolean; broken_links: string[] }> {
    return this.locked(async () => {
      const slug = normalizeSlug(input.slug);
      if (!SLUG_RE.test(slug) || slug.startsWith("raw/") || slug.startsWith("archive/") || slug.includes("..")) {
        throw new Error(`Invalid slug "${input.slug}". Use lowercase folders like topics/anmeldung or entities/kvr.`);
      }
      if (!input.body.trim()) throw new Error("Page body is empty.");
      const file = path.join(this.dir, `${slug}.md`);
      const created = !(await exists(file));
      const fm: Record<string, unknown> = {
        title: input.title,
        type: input.type,
        summary: input.summary,
        tags: input.tags?.length ? input.tags : undefined,
        sources: input.sources?.length ? input.sources : undefined,
        updated: new Date().toISOString().slice(0, 10),
        updated_by: input.author,
      };
      for (const k of Object.keys(fm)) if (fm[k] === undefined) delete fm[k];
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `---\n${YAML.stringify(fm).trim()}\n---\n\n${input.body.trim()}\n`, "utf8");
      await this.appendLogUnlocked(`${created ? "create" : "update"} [[${slug}]]: ${input.reason}`, input.author);
      await this.load();
      await this.commit(`${created ? "create" : "update"} ${slug}: ${input.reason}`, input.author);
      const broken = extractLinks(input.body).filter((l) => !resolveIn(this.pages, l));
      return { slug, created, broken_links: broken };
    });
  }

  async archivePage(slugIn: string, author: string, reason: string): Promise<void> {
    return this.locked(async () => {
      const p = this.resolve(slugIn);
      if (!p) throw new Error(`No page ${slugIn}`);
      if (["index", "overview", "log", "schema"].includes(p.slug)) throw new Error("Core pages cannot be archived.");
      const from = path.join(this.dir, `${p.slug}.md`);
      const to = path.join(this.dir, "archive", `${p.slug}.md`);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
      await this.appendLogUnlocked(`archive [[${p.slug}]]: ${reason}`, author);
      await this.load();
      await this.commit(`archive ${p.slug}: ${reason}`, author);
    });
  }

  async appendLog(entry: string, author: string): Promise<void> {
    return this.locked(async () => {
      await this.appendLogUnlocked(entry, author);
      await this.load();
      await this.commit(`log: ${entry.slice(0, 60)}`, author);
    });
  }

  private async appendLogUnlocked(entry: string, author: string): Promise<void> {
    const file = path.join(this.dir, "log.md");
    if (!(await exists(file))) {
      await fs.writeFile(file, "---\ntitle: Log\ntype: meta\nsummary: Append-only record of wiki operations.\n---\n\n# Log\n", "utf8");
    }
    const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
    await fs.appendFile(file, `\n- ${ts} UTC (${author}): ${entry.replace(/\s+/g, " ").trim()}`, "utf8");
  }

  /** Regenerate index.md: every page once, grouped by type, with its summary. */
  renderIndex(): string {
    const order = ["overview", "topic", "entity", "source", "query", "meta"];
    const heading: Record<string, string> = { overview: "Overview", topic: "Topics", entity: "Entities", source: "Sources", query: "Filed answers", meta: "Meta" };
    const pages = [...this.pages.values()].filter((p) => p.slug !== "index");
    const groups = new Map<string, WikiPage[]>();
    for (const p of pages) groups.set(p.type, [...(groups.get(p.type) ?? []), p]);
    const types = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 99 * Number(!order.includes(a))) - (order.indexOf(b) + 99 * Number(!order.includes(b))));
    const sections = types.map((t) => {
      const ps = groups.get(t)!.sort((a, b) => a.slug.localeCompare(b.slug));
      return `## ${heading[t] ?? t}\n\n${ps.map((p) => `- [[${p.slug}|${p.title}]]${p.summary ? `: ${p.summary}` : ""}`).join("\n")}`;
    });
    return `# Index\n\n${pages.length} pages. Regenerated automatically; start with [[overview]].\n\n${sections.join("\n\n")}\n`;
  }

  async rebuildIndex(author: string): Promise<number> {
    return this.locked(async () => {
      const body = this.renderIndex();
      const fm = { title: "Index", type: "meta", summary: "Catalog of every page in the wiki, grouped by type.", updated: new Date().toISOString().slice(0, 10), updated_by: author };
      await fs.writeFile(path.join(this.dir, "index.md"), `---\n${YAML.stringify(fm).trim()}\n---\n\n${body}`, "utf8");
      await this.load();
      await this.commit("rebuild index", author);
      return this.pages.size;
    });
  }

  // ------------------------------------------------------------- raw inbox

  private rawDir() {
    return path.join(this.dir, "raw");
  }

  static rawId(url: string): string {
    return createHash("sha1").update(url).digest("hex").slice(0, 12);
  }

  async addRaw(item: { title: string; url: string; source: string; published?: string; body: string }): Promise<boolean> {
    const id = WikiStore.rawId(item.url);
    const month = new Date().toISOString().slice(0, 7);
    const dir = path.join(this.rawDir(), month);
    if (await this.findRawFile(id)) return false;
    await fs.mkdir(dir, { recursive: true });
    const fm = { id, title: item.title, url: item.url, source: item.source, published: item.published, fetched: new Date().toISOString(), status: "new" };
    await fs.writeFile(path.join(dir, `${id}.md`), `---\n${YAML.stringify(fm).trim()}\n---\n\n${item.body.trim()}\n`, "utf8");
    return true;
  }

  private rawIndex = new Map<string, string>();

  private async findRawFile(id: string): Promise<string | undefined> {
    if (this.rawIndex.has(id)) return this.rawIndex.get(id);
    const files = await listMarkdown(this.rawDir()).catch(() => [] as string[]);
    for (const f of files) this.rawIndex.set(path.basename(f, ".md"), f);
    return this.rawIndex.get(id);
  }

  async listRaw(status: RawItem["status"] | "all" = "new", limit = 30): Promise<RawItem[]> {
    const files = await listMarkdown(this.rawDir()).catch(() => [] as string[]);
    const items: RawItem[] = [];
    for (const f of files) {
      const { data, body } = parseFrontmatter(await fs.readFile(f, "utf8"));
      this.rawIndex.set(path.basename(f, ".md"), f);
      const it: RawItem = {
        id: String(data.id ?? path.basename(f, ".md")),
        title: String(data.title ?? ""),
        url: data.url ? String(data.url) : undefined,
        source: String(data.source ?? "unknown"),
        published: data.published ? String(data.published) : undefined,
        fetched: String(data.fetched ?? ""),
        status: (data.status as RawItem["status"]) ?? "new",
        body,
        file: f,
      };
      if (status === "all" || it.status === status) items.push(it);
    }
    items.sort((a, b) => String(b.published ?? b.fetched).localeCompare(String(a.published ?? a.fetched)));
    return items.slice(0, limit);
  }

  async setRawStatus(ids: string[], status: RawItem["status"], author: string, note?: string): Promise<number> {
    return this.locked(async () => {
      let n = 0;
      for (const id of ids) {
        const f = await this.findRawFile(id);
        if (!f) continue;
        const text = await fs.readFile(f, "utf8");
        const { data, body } = parseFrontmatter(text);
        data.status = status;
        if (note) data.note = note;
        data.processed = new Date().toISOString();
        await fs.writeFile(f, `---\n${YAML.stringify(data).trim()}\n---\n\n${body.trim()}\n`, "utf8");
        n++;
      }
      if (n) await this.commit(`raw: mark ${n} item(s) ${status}`, author);
      return n;
    });
  }

  // ------------------------------------------------------------------ lint

  async lint() {
    const broken: { page: string; link: string }[] = [];
    for (const p of this.pages.values()) for (const l of p.links) if (!resolveIn(this.pages, l)) broken.push({ page: p.slug, link: l });
    const core = new Set(["index", "overview", "log", "schema"]);
    const orphans = [...this.pages.values()].filter((p) => !core.has(p.slug) && !(this.backlinks.get(p.slug)?.size)).map((p) => p.slug);
    const unsourced = [...this.pages.values()].filter((p) => !core.has(p.slug) && p.type !== "meta" && p.sources.length === 0).map((p) => p.slug);
    const cutoff = Date.now() - 90 * 86_400_000;
    const stale = [...this.pages.values()].filter((p) => p.updated && Date.parse(p.updated) < cutoff).map((p) => ({ slug: p.slug, updated: p.updated }));
    const pending = await this.listRaw("new", 500);
    const notInIndex = (() => {
      const idx = this.pages.get("index");
      if (!idx) return [];
      const linked = new Set(idx.links.map((l) => resolveIn(this.pages, l) ?? l));
      return [...this.pages.keys()].filter((s) => !core.has(s) && !linked.has(s));
    })();
    return {
      pages: this.pages.size,
      broken_links: broken,
      orphans,
      unsourced,
      stale,
      missing_from_index: notInIndex,
      raw_pending: pending.length,
      oldest_pending: pending.at(-1)?.fetched,
    };
  }

  // ------------------------------------------------------------------- git

  private gitReady = false;

  private async ensureGit() {
    try {
      await execFileP("git", ["--version"]);
      if (!(await exists(path.join(this.dir, ".git")))) {
        await execFileP("git", ["init", "-q", "-b", "main"], { cwd: this.dir });
        await execFileP("git", ["-c", "user.name=munichMCP", "-c", "user.email=wiki@munichmcp.local", "add", "-A"], { cwd: this.dir });
        await execFileP("git", ["-c", "user.name=munichMCP", "-c", "user.email=wiki@munichmcp.local", "commit", "-q", "-m", "seed wiki", "--allow-empty"], { cwd: this.dir });
      }
      this.gitReady = true;
    } catch (err) {
      console.warn(`[wiki] git unavailable, writes will not be versioned: ${String(err)}`);
    }
  }

  private async commit(message: string, author: string) {
    if (!this.gitReady) return;
    const who = author.replace(/[<>\n]/g, "").slice(0, 60) || "agent";
    try {
      await execFileP("git", ["add", "-A"], { cwd: this.dir });
      await execFileP("git", ["-c", `user.name=${who}`, "-c", "user.email=wiki@munichmcp.local", "commit", "-q", "-m", message.slice(0, 200)], { cwd: this.dir });
    } catch {
      /* nothing to commit */
    }
  }

  async history(limit = 20): Promise<string[]> {
    if (!this.gitReady) return [];
    try {
      const { stdout } = await execFileP("git", ["log", `-${limit}`, "--date=iso", "--pretty=format:%ad | %an | %s"], { cwd: this.dir });
      return stdout.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}

function resolveIn(pages: Map<string, WikiPage>, slug: string): string | undefined {
  if (pages.has(slug)) return slug;
  // Allow short links like [[anmeldung]] when unambiguous.
  const matches = [...pages.keys()].filter((k) => k === slug || k.endsWith(`/${slug}`));
  return matches.length === 1 ? matches[0] : undefined;
}

function inferType(slug: string): string {
  const top = slug.split("/")[0];
  return ({ topics: "topic", entities: "entity", sources: "source", queries: "query" } as Record<string, string>)[top] ?? (["index", "log", "schema"].includes(slug) ? "meta" : "topic");
}

function firstHeading(body: string): string | undefined {
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  await walk(dir);
  return out;
}

export const wiki = new WikiStore(config.wikiDir);

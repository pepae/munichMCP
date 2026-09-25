import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";
import MiniSearch from "minisearch";
import { datasetCsv } from "../lib/ckan.js";
import { diskCached, DAY } from "../lib/cache.js";
import { cite, type Citation } from "../lib/sources.js";
import { processTerm, snippet } from "../lib/text.js";

/**
 * City services knowledge: the ~1,450 articles of the city's
 * "Dienstleistungsfinder" (published by it@M on Hugging Face, MIT), plus the
 * official list of the city's online services (dl-de/by-2.0).
 */

const PARQUET = "https://huggingface.co/datasets/it-at-m/munich-public-services/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet";

export interface ServiceArticle {
  id: string;
  name: string;
  language: string;
  url: string;
  last_modified?: string;
  keywords: string[];
  content: string;
}

export interface OnlineService {
  name: string;
  area: string;
  category: string;
  url: string;
}

interface Corpus {
  articles: ServiceArticle[];
  online: OnlineService[];
  index: MiniSearch;
  onlineIndex: MiniSearch;
  fetchedAt: number;
}

let corpus: Corpus | undefined;
let loading: Promise<Corpus> | undefined;

async function fetchArticles(): Promise<ServiceArticle[]> {
  const file = await asyncBufferFromUrl({ url: PARQUET });
  const rows = (await parquetReadObjects({ file, columns: ["id", "name", "language", "source", "lastModification", "keywords", "content", "public"] })) as Record<string, any>[];
  return rows
    .filter((r) => r.public !== false && r.content)
    .map((r) => ({
      id: String(r.id),
      name: String(r.name ?? "").trim(),
      language: String(r.language ?? "de"),
      url: String(r.source ?? ""),
      last_modified: r.lastModification ? new Date(r.lastModification).toISOString().slice(0, 10) : undefined,
      keywords: Array.isArray(r.keywords) ? r.keywords.map(String).filter((k: string) => k && k !== "before" && k !== "after") : [],
      content: String(r.content).trim(),
    }));
}

export async function loadServices(): Promise<Corpus> {
  if (corpus && Date.now() - corpus.fetchedAt < DAY) return corpus;
  loading ??= (async () => {
    const [{ value: articles, fetchedAt }, onlineCsv] = await Promise.all([
      diskCached("services_articles", DAY, fetchArticles),
      datasetCsv("liste-aller-verfuegbaren-onlinedienste-der-landeshauptstadt-muenchen").catch(() => undefined),
    ]);
    const online: OnlineService[] = (onlineCsv?.rows ?? [])
      .map((r) => ({ name: r["leika-bezeichnung"] || r["leika-name"], area: r["leika-name"], category: r["ozg-bezeichnung"], url: r.url }))
      .filter((o) => o.name && o.url);
    const index = new MiniSearch<ServiceArticle & { key: string }>({
      idField: "key",
      fields: ["name", "keywords", "content"],
      extractField: (doc, field) => (field === "keywords" ? doc.keywords.join(" ") : (doc as any)[field]),
      storeFields: ["name"],
      processTerm: (t) => processTerm(t),
      searchOptions: { boost: { name: 5, keywords: 3 }, prefix: true, fuzzy: 0.15, combineWith: "OR" },
    });
    const seen = new Set<string>();
    index.addAll(
      articles
        .map((a) => ({ ...a, key: `${a.id}:${a.language}` }))
        .filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true))),
    );
    const onlineIndex = new MiniSearch<OnlineService & { id: number }>({
      fields: ["name", "area", "category"],
      storeFields: ["name"],
      processTerm: (t) => processTerm(t),
      searchOptions: { boost: { name: 3 }, prefix: true, fuzzy: 0.15, combineWith: "OR" },
    });
    onlineIndex.addAll(online.map((o, id) => ({ ...o, id })));
    corpus = { articles, online, index, onlineIndex, fetchedAt };
    return corpus;
  })().finally(() => (loading = undefined));
  return loading;
}

export interface ServiceHit {
  id: string;
  name: string;
  url: string;
  language: string;
  last_modified?: string;
  summary: string;
  score: number;
}

function summaryOf(a: ServiceArticle, query: string): string {
  const m = /##\s*Zusammenfassung\s*\n+([\s\S]*?)(\n##|$)/.exec(a.content) ?? /##\s*Summary\s*\n+([\s\S]*?)(\n##|$)/i.exec(a.content);
  const s = m?.[1]?.trim();
  return s ? snippet(s, query, 320) : snippet(a.content.replace(/^#.*$/m, ""), query, 320);
}

export async function searchServices(query: string, opts: { limit?: number; language?: "de" | "en" } = {}): Promise<{ hits: ServiceHit[]; online: OnlineService[]; citations: Citation[] }> {
  const c = await loadServices();
  const byKey = new Map(c.articles.map((a) => [`${a.id}:${a.language}`, a]));
  const langs = new Map<string, Set<string>>();
  for (const a of c.articles) langs.set(a.id, (langs.get(a.id) ?? new Set()).add(a.language));
  const lang = opts.language;
  const results: ServiceHit[] = [];
  const used = new Set<string>();
  for (const r of c.index.search(query)) {
    const art = byKey.get(String(r.id));
    if (!art || used.has(art.id)) continue;
    // Prefer the requested language version when the article exists in it.
    if (lang && art.language !== lang && langs.get(art.id)?.has(lang)) continue;
    used.add(art.id);
    results.push({ id: art.id, name: art.name, url: art.url, language: art.language, last_modified: art.last_modified, summary: summaryOf(art, query), score: Math.round(r.score * 10) / 10 });
    if (results.length >= (opts.limit ?? 6)) break;
  }
  const online = c.onlineIndex
    .search(query)
    .slice(0, 5)
    .map((r) => c.online[Number(r.id)]);
  return { hits: results, online, citations: [cite("services", c.fetchedAt), cite("onlineServices", c.fetchedAt)] };
}

export async function getService(idOrUrl: string): Promise<{ article: ServiceArticle; citation: Citation } | undefined> {
  const c = await loadServices();
  const q = idOrUrl.trim();
  const art =
    c.articles.find((a) => a.id === q) ??
    c.articles.find((a) => a.url === q || a.url.includes(q)) ??
    c.articles.find((a) => a.name.toLowerCase() === q.toLowerCase());
  return art ? { article: art, citation: cite("services", c.fetchedAt) } : undefined;
}

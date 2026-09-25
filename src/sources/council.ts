import MiniSearch from "minisearch";
import { liveCache, HOUR } from "../lib/cache.js";
import { cite, type Citation } from "../lib/sources.js";
import { processTerm } from "../lib/text.js";
import { fetchFeed, type FeedItem } from "./wiki-collector.js";
import { wiki } from "./wiki.js";

/**
 * City council (Stadtrat) and district committee (Bezirksausschuss) motions
 * and inquiries from the official RIS RSS feeds, parsed into structured items.
 */

export const COUNCIL_FEEDS = {
  stadtrat: { url: "https://risi.muenchen.de/risi/rss?feed=StR-Antraege", label: "Stadtrat (city council) motions and inquiries" },
  bezirksausschuss: { url: "https://risi.muenchen.de/risi/rss?feed=BA-Antraege", label: "Bezirksausschuss (district committee) motions" },
} as const;

export interface CouncilItem {
  body: keyof typeof COUNCIL_FEEDS;
  number: string;
  subject: string;
  kind?: string;
  submitted_by?: string;
  district_committee?: string;
  date?: string;
  url: string;
}

function parseItem(body: keyof typeof COUNCIL_FEEDS, it: FeedItem): CouncilItem {
  const d = it.description ?? "";
  const field = (name: string) => new RegExp(`${name}:\\s*\\n?([^\\n]+)`, "i").exec(d)?.[1]?.trim();
  const subject = field("Betreff") ?? it.title;
  return {
    body,
    number: it.title.replace(/\s+vom\s+.*$/, "").trim(),
    subject,
    kind: field("Typ"),
    submitted_by: field("Gestellt von") ?? field("Antragsteller"),
    district_committee: field("Bezirksausschuss") ?? (/BA[- ]?(\d{1,2})/.exec(it.title)?.[1] ? `BA ${/BA[- ]?(\d{1,2})/.exec(it.title)![1]}` : undefined),
    date: it.published ? new Date(it.published).toISOString() : undefined,
    url: it.link,
  };
}

async function loadAll(): Promise<{ items: CouncilItem[]; fetchedAt: number }> {
  const { value, fetchedAt } = await liveCache.get("council:all", HOUR, async () => {
    const out = new Map<string, CouncilItem>();
    for (const [key, f] of Object.entries(COUNCIL_FEEDS) as [keyof typeof COUNCIL_FEEDS, (typeof COUNCIL_FEEDS)[keyof typeof COUNCIL_FEEDS]][]) {
      const items = await fetchFeed(f.url);
      for (const i of items) out.set(i.link, parseItem(key, i));
    }
    // The feeds only carry the newest items; the wiki collector archives every
    // item it has seen in raw/, so history grows over time.
    for (const r of await wiki.listRaw("all", 20_000)) {
      if (!r.url || out.has(r.url) || !r.source.startsWith("ris-")) continue;
      const body = r.source === "ris-ba-antraege" ? "bezirksausschuss" : "stadtrat";
      out.set(r.url, parseItem(body, { title: r.title, link: r.url, published: r.published, description: r.body.replace(/^Source feed:.*\n+/, "") }));
    }
    return [...out.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  });
  return { items: value, fetchedAt };
}

export async function councilSearch(opts: { query?: string; body?: "stadtrat" | "bezirksausschuss" | "all"; limit?: number }): Promise<{ items: CouncilItem[]; total: number; citation: Citation; window: string }> {
  const { items, fetchedAt } = await loadAll();
  let pool = opts.body && opts.body !== "all" ? items.filter((i) => i.body === opts.body) : items;
  if (opts.query?.trim()) {
    const ms = new MiniSearch<CouncilItem & { id: number }>({
      fields: ["subject", "number", "submitted_by", "district_committee", "kind"],
      storeFields: [],
      processTerm: (t) => processTerm(t),
      searchOptions: { boost: { subject: 3 }, prefix: true, fuzzy: 0.2, combineWith: "OR" },
    });
    ms.addAll(pool.map((p, id) => ({ ...p, id })));
    pool = ms.search(opts.query).map((r) => pool[Number(r.id)]);
  }
  const dates = items.map((i) => i.date).filter(Boolean).sort() as string[];
  return {
    items: pool.slice(0, opts.limit ?? 15),
    total: pool.length,
    citation: cite("ris", fetchedAt),
    window: dates.length ? `${dates[0].slice(0, 10)} to ${dates.at(-1)!.slice(0, 10)}` : "",
  };
}

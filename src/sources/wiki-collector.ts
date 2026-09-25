import { XMLParser } from "fast-xml-parser";
import { packageSearch } from "../lib/ckan.js";
import { fetchText } from "../lib/http.js";
import { stripHtml, truncate } from "../lib/text.js";
import { wiki } from "./wiki.js";

/**
 * Deterministic collector for the wiki's raw/ inbox. No LLM involved: it only
 * captures new primary-source items (with their text and URL) so that a
 * maintainer agent can later compile them into cross-linked pages.
 */

export interface FeedDef {
  id: string;
  label: string;
  url: string;
}

export const FEEDS: FeedDef[] = [
  { id: "ris-stadtrat-antraege", label: "Stadtrat: Anträge und Anfragen", url: "https://risi.muenchen.de/risi/rss?feed=StR-Antraege" },
  { id: "ris-ba-antraege", label: "Bezirksausschüsse: Anträge", url: "https://risi.muenchen.de/risi/rss?feed=BA-Antraege" },
  { id: "rathaus-umschau", label: "Rathaus Umschau (press releases)", url: "https://ru.muenchen.de/rss" },
];

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text", processEntities: true });

export interface FeedItem {
  title: string;
  link: string;
  published?: string;
  description?: string;
  guid?: string;
}

const text = (v: unknown): string => (typeof v === "string" ? v : v && typeof v === "object" && "#text" in (v as any) ? String((v as any)["#text"]) : v == null ? "" : String(v));

export function parseFeed(body: string): FeedItem[] {
  const doc = xml.parse(body);
  const items: any[] = doc?.rss?.channel?.item ? [].concat(doc.rss.channel.item) : doc?.feed?.entry ? [].concat(doc.feed.entry) : [];
  return items
    .map((it) => {
      const link = text(it.link?.["@href"] ?? it.link) || text(it.guid);
      return {
        title: stripHtml(text(it.title)).trim(),
        link: link.trim(),
        published: text(it.pubDate ?? it.published ?? it.updated ?? it["dc:date"]) || undefined,
        description: stripHtml(text(it.description ?? it.summary ?? it.content ?? it["content:encoded"])).trim() || undefined,
        guid: text(it.guid) || undefined,
      };
    })
    .filter((i) => i.title && i.link);
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  return parseFeed(await fetchText(url, { timeoutMs: 30_000 }));
}

function isoDate(s?: string): string | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : s;
}

let running: Promise<{ added: number; errors: string[]; bySource: Record<string, number> }> | undefined;

export function runCollector() {
  running ??= collect().finally(() => (running = undefined));
  return running;
}

async function collect() {
  const errors: string[] = [];
  const bySource: Record<string, number> = {};
  let added = 0;
  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed.url);
      let n = 0;
      for (const it of items.slice(0, 60)) {
        // RIS titles are only numbers; the subject is in the description ("Betreff: ...").
        const subject = feed.id.startsWith("ris-") ? /Betreff:\s*\n?([^\n]+)/i.exec(it.description ?? "")?.[1]?.trim() : undefined;
        const ok = await wiki.addRaw({
          title: truncate(subject ? `${it.title}: ${subject}` : it.title, 200),
          url: it.link,
          source: feed.id,
          published: isoDate(it.published),
          body: `Source feed: ${feed.label} (${feed.url})\n\n${it.description ?? "(no description in feed; open the URL for the document)"}`,
        });
        if (ok) n++;
      }
      bySource[feed.id] = n;
      added += n;
    } catch (err) {
      errors.push(`${feed.id}: ${String(err)}`);
    }
  }
  // Newly published datasets on the open data portal (last 14 days).
  try {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const r = await packageSearch({ q: `metadata_created:[${since} TO NOW]`, sort: "metadata_created desc", rows: 25 });
    let n = 0;
    for (const p of r.results) {
      const ok = await wiki.addRaw({
        title: `Neuer Open-Data-Datensatz: ${p.title}`,
        url: `https://opendata.muenchen.de/dataset/${p.name}`,
        source: "opendata-new-datasets",
        published: p.metadata_created,
        body:
          `Organisation: ${p.organization?.title ?? "?"}\nLicence: ${p.license_id ?? "?"}\nResources: ${p.resources.map((x) => x.format).filter(Boolean).join(", ")}\n\n` +
          stripHtml(p.notes ?? "").slice(0, 3000),
      });
      if (ok) n++;
    }
    bySource["opendata-new-datasets"] = n;
    added += n;
  } catch (err) {
    errors.push(`opendata: ${String(err)}`);
  }
  if (added) await wiki.appendLog(`collector captured ${added} new raw item(s): ${JSON.stringify(bySource)}`, "collector");
  console.log(`[collector] added ${added} ${JSON.stringify(bySource)} ${errors.length ? `errors: ${errors.join("; ")}` : ""}`);
  return { added, errors, bySource };
}

export function scheduleCollector(intervalHours: number) {
  if (!intervalHours) return;
  const run = () => runCollector().catch((e) => console.warn(`[collector] ${String(e)}`));
  setTimeout(run, 60_000).unref();
  setInterval(run, intervalHours * 3_600_000).unref();
}

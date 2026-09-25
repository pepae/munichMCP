/** German-friendly text utilities for search and matching. */

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * CISTEM stemmer (Weissweiler & Fraser 2017), a compact German stemmer.
 * Works on lower-cased, umlaut-preserving input; we fold umlauts afterwards.
 */
export function cistem(word: string): string {
  let w = word.toLowerCase();
  w = w.replace(/ü/g, "u").replace(/ö/g, "o").replace(/ä/g, "a").replace(/ß/g, "ss");
  w = w.replace(/^ge(.{4,})/, "$1");
  w = w.replace(/sch/g, "$").replace(/ei/g, "%").replace(/ie/g, "&");
  w = w.replace(/(.)\1/g, "$1*");
  while (w.length > 3) {
    if (w.length > 5 && /e[mr]$/.test(w)) {
      w = w.slice(0, -2);
      continue;
    }
    if (w.length > 5 && /nd$/.test(w)) {
      w = w.slice(0, -2);
      continue;
    }
    if (/t$/.test(w)) {
      w = w.slice(0, -1);
      continue;
    }
    if (/[esn]$/.test(w)) {
      w = w.slice(0, -1);
      continue;
    }
    break;
  }
  return w.replace(/(.)\*/g, "$1$1").replace(/\$/g, "sch").replace(/%/g, "ei").replace(/&/g, "ie");
}

const STOP = new Set(
  (
    "der die das den dem des ein eine einer einen eines und oder in im am an auf aus bei mit nach von vom zu zum zur fuer für " +
    "ist sind wird werden wie was wo wer ich sie er es wir ihr mein meine kann koennen können muss muessen müssen " +
    "the a an and or of to for in on at is are how what where do does i my can with from"
  ).split(/\s+/),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Term processor for MiniSearch: fold + stem, drop stop words. */
export function processTerm(term: string): string | null {
  const t = term.toLowerCase();
  if (t.length < 2 || STOP.has(t)) return null;
  return fold(cistem(t));
}

export function snippet(text: string, query: string, maxLen = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const terms = tokenize(query).map(fold);
  const folded = fold(clean);
  let pos = -1;
  for (const t of terms) {
    const stem = t.slice(0, Math.max(4, t.length - 2));
    pos = folded.indexOf(stem);
    if (pos >= 0) break;
  }
  const start = pos < 0 ? 0 : Math.max(0, pos - Math.floor(maxLen / 3));
  const cut = clean.slice(start, start + maxLen);
  return (start > 0 ? "…" : "") + cut + (start + maxLen < clean.length ? "…" : "");
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
  szlig: "ß", euro: "€", ndash: "–", mdash: "-", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sect: "§", deg: "°", hellip: "…",
  eacute: "é", egrave: "è", agrave: "à", shy: "",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
      .replace(/<hr[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

// Windows-1252 code points for bytes 0x80-0x9F (the rest of 0x00-0xFF maps 1:1).
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const C1_CONTROLS = /[\u0080-\u009f]/g;

/** Repair UTF-8 text that was mis-decoded as Windows-1252/Latin-1 upstream ("GroÃŸer" -> "Großer"). */
export function fixMojibake(s: string): string {
  if (!/[ÂÃ][\u0080-¿Œ-™]/.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x100) bytes.push(cp);
    else if (CP1252[cp] !== undefined) bytes.push(CP1252[cp]);
    else return s; // not a mojibake string
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)).replace(C1_CONTROLS, "");
  } catch {
    return s;
  }
}

import DOMPurify from "dompurify";
import { marked } from "marked";
import { add, clear, h } from "./dom.js";
import type { Host } from "./view.js";

export interface WikiView {
  kind: "wiki";
  slug: string;
  title: string;
  type: string;
  updated?: string;
  body: string;
  sources: string[];
  tags: string[];
  outgoing: { slug: string; title?: string; exists: boolean }[];
  backlinks: { slug: string; title: string }[];
  url?: string;
}

const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

export function renderWiki(root: HTMLElement, v: WikiView, host: Host) {
  const history: WikiView[] = [];
  let cur = v;

  const paint = () => {
    clear(root);
    const md = cur.body
      .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
      .map((part, i) =>
        i % 2 === 1
          ? part
          : part.replace(LINK, (_m, slug: string, label?: string) => {
              const target = cur.outgoing.find((o) => o.slug.endsWith(slug.trim().toLowerCase()) || o.slug === slug.trim());
              return `<a data-wiki="${(target?.slug ?? slug).trim()}" class="${target?.exists === false ? "missing" : ""}">${(label ?? target?.title ?? slug).trim()}</a>`;
            }),
      )
      .join("");
    const html = DOMPurify.sanitize(marked.parse(md, { async: false }) as string, { ADD_ATTR: ["data-wiki"] });
    const article = h("div", { class: "md" });
    article.innerHTML = html;
    article.querySelectorAll("a").forEach((a) => {
      const slug = a.getAttribute("data-wiki");
      const href = a.getAttribute("href");
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (slug) open(slug);
        else if (href) host.openLink(href);
      });
    });
    add(
      root,
      h(
        "div",
        { class: "row" },
        history.length ? h("button", { onclick: () => { cur = history.pop()!; paint(); } }, "← Back") : null,
        h("span", { class: "pill" }, cur.type),
        cur.updated ? h("span", { class: "muted" }, `updated ${cur.updated}`) : null,
        h("div", { class: "spacer" }),
        cur.url ? h("a", { onclick: () => host.openLink(cur.url!) }, "Open in browser") : null,
      ),
      article,
      cur.sources.length ? h("div", null, h("h2", null, "Sources"), h("ul", null, cur.sources.map((s) => h("li", null, /^https?:/.test(s) ? h("a", { onclick: () => host.openLink(s) }, s) : s)))) : null,
      cur.backlinks.length ? h("div", null, h("h2", null, "Linked from"), h("div", null, cur.backlinks.map((b) => h("a", { class: "pill", onclick: () => open(b.slug) }, b.title)))) : null,
      h("div", { class: "attr" }, "munichMCP wiki: agent-maintained, every page cites its sources. Unofficial."),
    );
  };

  async function open(slug: string) {
    try {
      const res = await host.callTool("wiki_read", { page: slug });
      const next = res?._meta?.["munichmcp/view"] as WikiView | undefined;
      if (next?.kind === "wiki") {
        history.push(cur);
        cur = next;
        paint();
        window.scrollTo(0, 0);
      }
    } catch {
      /* page missing */
    }
  }

  paint();
}

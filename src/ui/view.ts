import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { add, clear, h } from "./dom.js";
import { renderDepartures, type DeparturesView } from "./departures.js";
import { renderForm, type FormView } from "./forms.js";
import { renderMap, type MapView } from "./map.js";
import { renderWiki, type WikiView } from "./wiki.js";
import "./view.css";

export interface Host {
  dark: boolean;
  callTool(name: string, args: Record<string, unknown>): Promise<any>;
  openLink(url: string): void;
  onTeardown(fn: () => void): void;
}

interface BarsView {
  kind: "bars";
  title: string;
  subtitle?: string;
  unit?: string;
  rows: { label: string; value: number; display?: string; highlight?: boolean }[];
  note?: string;
  attribution?: string;
}

interface CardsView {
  kind: "cards";
  title: string;
  subtitle?: string;
  cards: { title: string; lines: string[]; tone?: string }[];
  items?: { title: string; lines: string[] }[];
  attribution?: string;
}

type View = MapView | DeparturesView | WikiView | FormView | BarsView | CardsView;

const root = document.getElementById("root")!;
const teardowns: (() => void)[] = [];
let dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

const app = new App({ name: "munichMCP view", version: "0.1.0" });

const host: Host = {
  get dark() {
    return dark;
  },
  callTool: (name, args) => app.callServerTool({ name, arguments: args }),
  openLink: (url) => {
    app.openLink({ url }).catch(() => window.open(url, "_blank", "noopener"));
  },
  onTeardown: (fn) => teardowns.push(fn),
};

function applyContext(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    dark = ctx.theme === "dark";
    document.documentElement.dataset.theme = ctx.theme;
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

function renderBars(el: HTMLElement, v: BarsView) {
  const max = Math.max(...v.rows.map((r) => Math.abs(r.value)), 1);
  add(
    el,
    h("h1", null, v.title),
    v.subtitle ? h("div", { class: "sub" }, v.subtitle) : null,
    h(
      "div",
      { class: "bars" },
      v.rows.map((r) =>
        h(
          "div",
          { class: `bar ${r.highlight ? "hl" : ""}` },
          h("div", null, r.label),
          h("div", { class: "track" }, h("div", { class: "fill", style: { width: `${(Math.abs(r.value) / max) * 100}%` } })),
          h("div", { class: "val" }, r.display ?? `${r.value}${v.unit ? ` ${v.unit}` : ""}`),
        ),
      ),
    ),
    v.note ? h("div", { class: "note", style: { marginTop: "8px" } }, v.note) : null,
    h("div", { class: "attr" }, v.attribution ?? ""),
  );
}

function renderCardsView(el: HTMLElement, v: CardsView) {
  add(
    el,
    h("h1", null, v.title),
    v.subtitle ? h("div", { class: "sub" }, v.subtitle) : null,
    h("div", { class: "cards" }, v.cards.map((c) => h("div", { class: `card ${c.tone ?? ""}` }, h("div", { class: "t" }, c.title), c.lines.map((l) => h("div", { class: "v" }, l))))),
    v.items?.length ? h("ul", { class: "list" }, v.items.map((i) => h("li", null, h("div", { class: "n" }, i.title), i.lines.map((l) => h("div", { class: "d" }, l))))) : null,
    h("div", { class: "attr" }, v.attribution ?? ""),
  );
}

export function render(result: { _meta?: Record<string, any>; structuredContent?: any; content?: any[]; isError?: boolean }) {
  while (teardowns.length) teardowns.pop()!();
  clear(root);
  const v = (result?._meta?.["munichmcp/view"] ?? result?.structuredContent?.view) as View | undefined;
  if (result?.isError || !v) {
    const text = result?.content?.find((c: any) => c.type === "text")?.text ?? "No data.";
    root.append(h("div", { class: "banner bad" }, String(text).slice(0, 600)));
    return;
  }
  switch (v.kind) {
    case "map":
      return renderMap(root, v, host);
    case "departures":
      return renderDepartures(root, v, host);
    case "wiki":
      return renderWiki(root, v, host);
    case "form":
      return renderForm(root, v, host);
    case "bars":
      return renderBars(root, v);
    case "cards":
      return renderCardsView(root, v);
  }
}

app.ontoolinput = () => {
  clear(root);
  root.append(h("div", { class: "loading" }, "Querying munichMCP…"));
};
app.ontoolresult = (result) => {
  try {
    render(result as any);
  } catch (e) {
    console.error("[munichMCP view] render failed", e);
    clear(root);
    root.append(h("div", { class: "banner bad" }, `Could not render this result: ${e instanceof Error ? e.message : String(e)}`));
    app.sendLog({ level: "error", data: `render failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}` }).catch(() => undefined);
  }
};
app.ontoolcancelled = () => {
  clear(root);
  root.append(h("div", { class: "muted" }, "Cancelled."));
};
app.onhostcontextchanged = applyContext;
app.onteardown = async () => {
  while (teardowns.length) teardowns.pop()!();
  return {};
};
app.onerror = (e) => console.error("[munichMCP view]", e);

app
  .connect()
  .then(() => {
    const ctx = app.getHostContext();
    if (ctx) applyContext(ctx);
  })
  .catch((e) => console.error("[munichMCP view] connect failed", e));

import { clear, h } from "./dom.js";
import type { Host } from "./view.js";

interface Dep {
  line: string;
  transport_type: string;
  destination: string;
  expected: string;
  planned: string;
  delay_min?: number;
  realtime: boolean;
  cancelled: boolean;
  platform?: string | number;
  replacement_service?: boolean;
  notes: string[];
}

export interface DeparturesView {
  kind: "departures";
  station: { id: string; name: string; place: string; transport_types: string[] };
  fetched_at: string;
  departures: Dep[];
  refresh?: { tool: string; arguments: Record<string, unknown> };
  attribution?: string;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function renderDepartures(root: HTMLElement, initial: DeparturesView, host: Host) {
  let v = initial;
  const body = h("tbody");
  const status = h("span", { class: "muted" });
  const btn = h("button", { onclick: () => refresh() }, "Refresh");
  root.append(
    h("div", { class: "row" }, h("h1", null, v.station.name), h("div", { class: "spacer" }), status, btn),
    h("div", { class: "sub" }, `${v.station.place || "München"}, live departures`),
    h("table", { class: "board" }, body),
    h("div", { class: "attr" }, `Data: ${v.attribution ?? "MVG"}. Times are real-time where available. Unofficial munichMCP.`),
  );

  function paint() {
    clear(body);
    const now = Date.now();
    for (const d of v.departures) {
      const mins = Math.max(0, Math.round((Date.parse(d.expected) - now) / 60_000));
      if (Date.parse(d.expected) < now - 60_000) continue;
      body.append(
        h(
          "tr",
          { class: d.cancelled ? "cancel" : "" },
          h("td", null, h("span", { class: `badge ${d.transport_type}` }, d.line)),
          h(
            "td",
            null,
            h("div", null, d.destination, d.replacement_service ? " (SEV)" : ""),
            d.notes.length ? h("div", { class: "note" }, d.notes.join(" / ").slice(0, 140)) : null,
          ),
          h("td", { class: "note" }, d.platform !== undefined ? `Gl. ${d.platform}` : ""),
          h(
            "td",
            { class: "min" },
            d.cancelled ? "Ausfall" : mins === 0 ? "now" : `${mins} min`,
            h("div", { class: "note" }, time(d.expected), d.delay_min ? h("span", { class: "delay" }, ` +${d.delay_min}`) : null, d.realtime ? "" : " (plan)"),
          ),
        ),
      );
    }
    status.textContent = `as of ${time(v.fetched_at)}`;
  }

  async function refresh() {
    if (!v.refresh) return;
    btn.setAttribute("disabled", "");
    try {
      const res = await host.callTool(v.refresh.tool, v.refresh.arguments);
      const next = res?._meta?.["munichmcp/view"] as DeparturesView | undefined;
      if (next?.kind === "departures") v = next;
    } catch (e) {
      status.textContent = "refresh failed";
    } finally {
      btn.removeAttribute("disabled");
      paint();
    }
  }

  paint();
  const tick = setInterval(paint, 20_000);
  const auto = setInterval(refresh, 60_000);
  host.onTeardown(() => {
    clearInterval(tick);
    clearInterval(auto);
  });
}

import { add, clear, h } from "./dom.js";
import type { Host } from "./view.js";

/**
 * Generic server-described form + result view (used by the rent calculator).
 * The server sends the field spec, current values and the computed result;
 * the view re-calls the tool when the user changes inputs.
 */

export interface FormField {
  name: string;
  label: string;
  type: "number" | "select" | "checkbox" | "text";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  help?: string;
}

export interface FormView {
  kind: "form";
  title: string;
  subtitle?: string;
  tool: string;
  fields: FormField[];
  values: Record<string, unknown>;
  result?: { headline: string; big?: string; range?: string; lines?: string[]; tone?: "good" | "warn" | "bad" };
  breakdown?: { label: string; value: string }[];
  attribution?: string;
}

export function renderForm(root: HTMLElement, initial: FormView, host: Host) {
  let v = initial;
  const resultBox = h("div");
  const form = h("div");

  const paintResult = () => {
    clear(resultBox);
    if (!v.result) return;
    add(
      resultBox,
      h(
        "div",
        { class: `banner ${v.result.tone ?? "good"}` },
        h("div", { class: "muted" }, v.result.headline),
        v.result.big ? h("div", { class: "big" }, v.result.big) : null,
        v.result.range ? h("div", { class: "range" }, v.result.range) : null,
        (v.result.lines ?? []).map((l) => h("div", null, l)),
      ),
      v.breakdown?.length
        ? h("table", { class: "board" }, h("tbody", null, v.breakdown.map((b) => h("tr", null, h("td", null, b.label), h("td", { class: "min" }, b.value)))))
        : null,
    );
  };

  const values: Record<string, unknown> = { ...v.values };
  const paintForm = () => {
    clear(form);
    const groups = new Map<string, FormField[]>();
    for (const f of v.fields) groups.set(f.group ?? "", [...(groups.get(f.group ?? "") ?? []), f]);
    for (const [g, fields] of groups) {
      if (g) form.append(h("h2", null, g));
      const inputs = fields.filter((f) => f.type !== "checkbox");
      const checks = fields.filter((f) => f.type === "checkbox");
      if (inputs.length)
        form.append(
          h(
            "div",
            { class: "form" },
            inputs.map((f) => {
              const val = values[f.name];
              const input =
                f.type === "select"
                  ? h("select", { onchange: (e: Event) => (values[f.name] = (e.target as HTMLSelectElement).value) }, (f.options ?? []).map((o) => h("option", { value: o.value, selected: String(val) === o.value }, o.label)))
                  : h("input", {
                      type: f.type === "number" ? "number" : "text",
                      value: val === undefined || val === null ? "" : String(val),
                      min: f.min, max: f.max, step: f.step,
                      onchange: (e: Event) => {
                        const raw = (e.target as HTMLInputElement).value;
                        values[f.name] = f.type === "number" ? (raw === "" ? undefined : Number(raw)) : raw;
                      },
                    });
              return h("label", { title: f.help }, f.label, input);
            }),
          ),
        );
      if (checks.length)
        form.append(
          h(
            "div",
            { class: "checks" },
            checks.map((f) =>
              h("label", { title: f.help }, h("input", { type: "checkbox", checked: Boolean(values[f.name]), onchange: (e: Event) => (values[f.name] = (e.target as HTMLInputElement).checked) }), ` ${f.label}`),
            ),
          ),
        );
    }
    form.append(h("div", { class: "row" }, h("button", { onclick: submit }, "Recalculate")));
  };

  async function submit() {
    try {
      const args = Object.fromEntries(Object.entries(values).filter(([, x]) => x !== undefined && x !== ""));
      const res = await host.callTool(v.tool, args);
      const next = res?._meta?.["munichmcp/view"] as FormView | undefined;
      if (next?.kind === "form") {
        v = next;
        paintResult();
      } else if (res?.isError) {
        v = { ...v, result: { headline: "Could not calculate", lines: [String(res.content?.[0]?.text ?? "")], tone: "bad" } };
        paintResult();
      }
    } catch (e) {
      v = { ...v, result: { headline: "Could not calculate", lines: [String(e)], tone: "bad" } };
      paintResult();
    }
  }

  add(root, h("h1", null, v.title), v.subtitle ? h("div", { class: "sub" }, v.subtitle) : null, resultBox, form, h("div", { class: "attr" }, v.attribution ?? ""));
  paintResult();
  paintForm();
}

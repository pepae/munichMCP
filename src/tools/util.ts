import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { LocationError } from "../lib/geocode.js";
import type { Citation } from "../lib/sources.js";

/** An error caused by the request itself (not by an upstream source). */
export class InputError extends Error {}

/** Single bundled MCP App view (switches renderer on `view.kind`). */
export const VIEW_URI = "ui://munichmcp/view-v1.html";

export interface ToolOutput {
  /** Markdown for the model (and text-only hosts). Must stand on its own. */
  text: string;
  /** Structured result (UI rendering, and model context on hosts that include it). */
  data?: Record<string, unknown>;
  /** View-only payload (geometry etc.), delivered in _meta so it stays out of model context. */
  view?: Record<string, unknown>;
  /**
   * Some hosts give the model only `structuredContent`, so by default the
   * Markdown text (minus the sources block) is also embedded there as
   * `summary`. Set false when `data` already carries the full text.
   */
  summary?: false;
}

/** Drop the trailing "Sources:" block (sources are structured in data.sources). */
export function withoutSources(text: string): string {
  const i = text.lastIndexOf("\n\nSources:\n");
  return i >= 0 ? text.slice(0, i) : text;
}

export function citationsMd(cs: (Citation | undefined)[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const c of cs) {
    if (!c || seen.has(c.name)) continue;
    seen.add(c.name);
    lines.push(`- ${c.name} (${c.publisher}; ${c.license}) ${c.url}${c.retrieved ? `, retrieved ${c.retrieved.slice(0, 16).replace("T", " ")} UTC` : ""}`);
  }
  return lines.length ? `\n\nSources:\n${lines.join("\n")}` : "";
}

interface ToolDef<S extends z.ZodObject> {
  title: string;
  description: string;
  input: S;
  /** Attach the munichMCP view (MCP Apps UI). */
  ui?: boolean;
  /** Status text for hosts that show tool progress. */
  invoking?: string;
  invoked?: string;
  /** Defaults to a read-only, idempotent, open-world tool. */
  annotations?: Record<string, boolean>;
  visibility?: ("model" | "app")[];
}

export function defineTool<S extends z.ZodObject>(
  server: McpServer,
  name: string,
  def: ToolDef<S>,
  handler: (args: z.infer<S>) => Promise<ToolOutput>,
): void {
  const meta: Record<string, unknown> = {};
  if (def.ui) meta.ui = { resourceUri: VIEW_URI, ...(def.visibility ? { visibility: def.visibility } : {}) };
  else if (def.visibility) meta.ui = { visibility: def.visibility };
  if (def.invoking) meta["openai/toolInvocation/invoking"] = def.invoking;
  if (def.invoked) meta["openai/toolInvocation/invoked"] = def.invoked;

  const config = {
    title: def.title,
    description: def.description,
    inputSchema: def.input,
    annotations: {
      title: def.title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      ...def.annotations,
    },
    _meta: meta,
  };

  const cb = async (args: z.infer<S>): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const out = await handler(args);
      console.log(`[tool] ${name} ok ${Date.now() - started}ms`);
      const structured = out.data
        ? out.summary === false
          ? out.data
          : { summary: "sources" in out.data ? withoutSources(out.text) : out.text, ...out.data }
        : undefined;
      return {
        content: [{ type: "text", text: out.text }],
        ...(structured ? { structuredContent: structured } : {}),
        ...(out.view ? { _meta: { "munichmcp/view": out.view } } : {}),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[tool] ${name} failed ${Date.now() - started}ms: ${msg}`);
      const hint = err instanceof LocationError || err instanceof InputError ? "" : " The upstream data source may be temporarily unavailable; try again shortly.";
      return { isError: true, content: [{ type: "text", text: `${name} failed: ${msg}.${hint}` }] };
    }
  };

  if (def.ui) {
    registerAppTool(server, name, config as any, cb as any);
  } else {
    server.registerTool(name, config as any, cb as any);
  }
}

export const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

import fs from "node:fs/promises";
import path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { config } from "../config.js";
import { packageShow, newestResource } from "../lib/ckan.js";
import { catalog } from "./catalog.js";
import type { Check, Manifest } from "./manifest.js";

/**
 * Deterministic health checks for every catalog source (no LLM involved):
 * upstream probes (HTTP, open data portal metadata and CSV columns, WFS
 * layers) and known-answer checks that call munichMCP's own tools. The
 * weekly source-doctor agent reads these results and proposes repairs.
 */

export interface CheckResult {
  name: string;
  type: Check["type"];
  ok: boolean;
  ms: number;
  detail: string;
}

export interface SourceHealth {
  id: string;
  name: string;
  status: "ok" | "degraded" | "failing";
  checks: CheckResult[];
}

export interface HealthReport {
  checked_at: string;
  target: string;
  summary: { ok: number; degraded: number; failing: number };
  sources: SourceHealth[];
}

type CallTool = (name: string, args: Record<string, unknown>) => Promise<string>;

const UA = { "User-Agent": config.userAgent };

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const v = await fn();
  return [v, Date.now() - t0];
}

/** First line of a CSV without downloading the whole file. */
async function csvHeader(url: string): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    let text = "";
    while (!text.includes("\n") && text.length < 65_536) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value, { stream: true });
    }
    ctrl.abort();
    const line = text.split(/\r?\n/)[0].replace(/^﻿/, "");
    const delim = (line.match(/;/g)?.length ?? 0) > (line.match(/,/g)?.length ?? 0) ? ";" : ",";
    return line.split(delim).map((c) => c.trim().replace(/^"|"$/g, "").trim());
  } finally {
    clearTimeout(timer);
  }
}

async function runCheck(c: Check, callTool: CallTool): Promise<CheckResult> {
  const base = { name: c.name ?? defaultName(c), type: c.type };
  try {
    const [detail, ms] = await timed(async () => {
      switch (c.type) {
        case "http": {
          const res = await fetch(c.url, { method: c.method, headers: UA, signal: AbortSignal.timeout(30_000), redirect: "follow" });
          if (res.status !== c.expect_status) throw new Error(`HTTP ${res.status}, expected ${c.expect_status}`);
          if (c.expect_text && c.method === "GET") {
            const body = (await res.text()).slice(0, 200_000);
            if (!new RegExp(c.expect_text, "i").test(body)) throw new Error(`response does not match /${c.expect_text}/`);
          }
          return `HTTP ${res.status}`;
        }
        case "ckan": {
          const pkg = await packageShow(c.dataset);
          const notes: string[] = [];
          if (c.licence_id && pkg.license_id !== c.licence_id) throw new Error(`licence changed: ${pkg.license_id} (expected ${c.licence_id})`);
          const modified = Date.parse(pkg.metadata_modified ?? "");
          const ageDays = Number.isFinite(modified) ? (Date.now() - modified) / 86_400_000 : Infinity;
          if (c.max_age_days && ageDays > c.max_age_days) throw new Error(`not updated for ${Math.round(ageDays)} days (limit ${c.max_age_days})`);
          notes.push(`updated ${Math.round(ageDays)} days ago`);
          if (c.columns?.length) {
            const res = newestResource(pkg, "CSV", c.resource ? new RegExp(c.resource, "i") : undefined);
            if (!res) throw new Error("no CSV resource");
            const header = await csvHeader(res.url);
            const missing = c.columns.filter((col) => !header.includes(col));
            if (missing.length) throw new Error(`columns missing: ${missing.join(", ")} (now: ${header.slice(0, 12).join(", ")})`);
            notes.push(`${c.columns.length} required columns present`);
          }
          return notes.join("; ");
        }
        case "wfs": {
          const ws = c.layer.split(":")[0];
          const q = new URLSearchParams({ service: "WFS", version: "1.1.0", request: "GetFeature", typeName: c.layer, resultType: "hits" });
          const res = await fetch(`https://geoportal.muenchen.de/geoserver/${ws}/ows?${q}`, { headers: UA, signal: AbortSignal.timeout(30_000) });
          const text = await res.text();
          const n = Number(/numberOfFeatures="(\d+)"/.exec(text)?.[1] ?? /numberMatched="(\d+)"/.exec(text)?.[1]);
          if (!res.ok || !Number.isFinite(n)) throw new Error(`layer not available (HTTP ${res.status})`);
          if (n < c.min_features) throw new Error(`${n} features, expected at least ${c.min_features}`);
          return `${n} features`;
        }
        case "tool": {
          const text = await callTool(c.tool, c.args);
          if (!new RegExp(c.expect, "i").test(text)) throw new Error(`answer does not match /${c.expect}/: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
          return "known answer matches";
        }
      }
    });
    return { ...base, ok: true, ms, detail };
  } catch (e) {
    return { ...base, ok: false, ms: 0, detail: e instanceof Error ? e.message : String(e) };
  }
}

function defaultName(c: Check): string {
  switch (c.type) {
    case "http":
      return `reachable: ${new URL(c.url).hostname}`;
    case "ckan":
      return `open data portal: ${c.dataset}`;
    case "wfs":
      return `map layer: ${c.layer}`;
    case "tool":
      return `known answer: ${c.tool}`;
  }
}

/** Calls tools on a running munichMCP over MCP (the same path assistants use). */
export async function mcpToolCaller(url: string): Promise<{ call: CallTool; close: () => Promise<void> }> {
  const client = new Client({ name: "munichmcp-health", version: config.version });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return {
    call: async (name, args) => {
      const r: any = await client.callTool({ name, arguments: args });
      const text = (r.content ?? []).map((x: any) => x.text ?? "").join("\n");
      if (r.isError) throw new Error(text.slice(0, 300));
      return text;
    },
    close: () => client.close(),
  };
}

export async function checkSources(opts: { mcpUrl: string; only?: string[]; manifests?: readonly Manifest[] }): Promise<HealthReport> {
  const list = (opts.manifests ?? catalog).filter((m) => m.status !== "deprecated" && (!opts.only?.length || opts.only.includes(m.id)));
  const caller = await mcpToolCaller(opts.mcpUrl);
  const sources: SourceHealth[] = [];
  try {
    // A few sources at a time: gentle on the city's servers.
    for (let i = 0; i < list.length; i += 4) {
      const batch = await Promise.all(
        list.slice(i, i + 4).map(async (m) => {
          const checks: CheckResult[] = [];
          for (const c of m.checks) checks.push(await runCheck(c, caller.call));
          const okCount = checks.filter((c) => c.ok).length;
          const status: SourceHealth["status"] = okCount === checks.length ? "ok" : okCount === 0 ? "failing" : "degraded";
          return { id: m.id, name: m.name, status, checks };
        }),
      );
      sources.push(...batch);
    }
  } finally {
    await caller.close().catch(() => undefined);
  }
  const summary = { ok: 0, degraded: 0, failing: 0 };
  for (const s of sources) summary[s.status]++;
  return { checked_at: new Date().toISOString(), target: opts.mcpUrl, summary, sources };
}

// ------------------------------------------------------------ persistence

const healthDir = () => path.join(config.dataDir, "health");

export async function saveReport(r: HealthReport): Promise<void> {
  await fs.mkdir(healthDir(), { recursive: true });
  await fs.writeFile(path.join(healthDir(), "latest.json"), JSON.stringify(r, null, 2));
  const compact = { at: r.checked_at, summary: r.summary, failing: r.sources.filter((s) => s.status !== "ok").map((s) => s.id) };
  await fs.appendFile(path.join(healthDir(), "history.jsonl"), JSON.stringify(compact) + "\n");
}

export async function latestReport(): Promise<HealthReport | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(healthDir(), "latest.json"), "utf8")) as HealthReport;
  } catch {
    return undefined;
  }
}

export async function healthHistory(limit = 30): Promise<{ at: string; summary: HealthReport["summary"]; failing: string[] }[]> {
  try {
    const lines = (await fs.readFile(path.join(healthDir(), "history.jsonl"), "utf8")).trim().split("\n");
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

let running: Promise<HealthReport> | undefined;

/** Run all checks against this server's own /mcp endpoint and store the report. */
export function runHealthChecks(): Promise<HealthReport> {
  running ??= (async () => {
    const r = await checkSources({ mcpUrl: `http://127.0.0.1:${config.port}/mcp` });
    await saveReport(r);
    console.log(`[health] ${r.summary.ok} ok, ${r.summary.degraded} degraded, ${r.summary.failing} failing${r.summary.ok === r.sources.length ? "" : `: ${r.sources.filter((s) => s.status !== "ok").map((s) => s.id).join(", ")}`}`);
    return r;
  })().finally(() => (running = undefined));
  return running;
}

export function scheduleHealthChecks(intervalHours: number): void {
  if (!intervalHours) return;
  const run = () => runHealthChecks().catch((e) => console.warn(`[health] ${String(e)}`));
  setTimeout(run, 5 * 60_000).unref(); // after warm-up
  setInterval(run, intervalHours * 3_600_000).unref();
}

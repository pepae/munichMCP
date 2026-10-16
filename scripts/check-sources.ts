/**
 * Validate the source catalog and run its health checks.
 *   npm run catalog:validate                     # schema and consistency only (no network)
 *   npm run check-sources                        # all checks against the public server
 *   npm run check-sources -- --url http://localhost:8420/mcp --only ratschbankerl,public-wifi
 *   npm run check-sources -- --md report.md --json report.json
 * Exit code 1 if validation fails or a source is failing, 2 if one is degraded.
 */
import fs from "node:fs";
import { catalog, catalogErrors } from "../src/catalog/catalog.js";
import { checkSources, type HealthReport } from "../src/catalog/health.js";
import { SOURCES } from "../src/lib/sources.js";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function validate(): string[] {
  const problems = catalogErrors.map((e) => `${e.file}: ${e.error}`);
  const sourceIds = new Set(Object.keys(SOURCES));
  const covered = new Set<string>();
  const categories = new Map<string, string>();
  for (const m of catalog) {
    const impl = m.implementation;
    if (impl.kind === "code") {
      if (!sourceIds.has(impl.source_id)) problems.push(`${m.id}: source_id "${impl.source_id}" is not in src/lib/sources.ts`);
      if (!fs.existsSync(impl.module)) problems.push(`${m.id}: module ${impl.module} does not exist`);
      covered.add(impl.source_id);
    } else {
      const prev = categories.get(impl.category.id);
      if (prev) problems.push(`${m.id}: category ${impl.category.id} already defined by ${prev}`);
      categories.set(impl.category.id, m.id);
      if (!m.checks.some((c) => c.type === "tool")) problems.push(`${m.id}: generic sources need a known-answer (tool) check`);
    }
  }
  for (const id of sourceIds) if (!covered.has(id)) problems.push(`source "${id}" in src/lib/sources.ts has no catalog manifest`);
  return problems;
}

function markdown(r: HealthReport): string {
  const icon = { ok: "ok", degraded: "DEGRADED", failing: "FAILING" };
  const lines = [
    `# Source health ${r.checked_at.slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Target: ${r.target}. ${r.summary.ok} ok, ${r.summary.degraded} degraded, ${r.summary.failing} failing (of ${r.sources.length}).`,
    "",
    "| Source | Status | Failed checks |",
    "|---|---|---|",
    ...r.sources.map((s) => `| ${s.id} | ${icon[s.status]} | ${s.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`.replace(/\|/g, "/")).join("<br>")} |`),
  ];
  return lines.join("\n") + "\n";
}

const problems = validate();
if (problems.length) {
  console.error(`Catalog validation failed:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Catalog OK: ${catalog.length} sources (${catalog.filter((m) => m.implementation.kind !== "code").length} YAML-only).`);
if (args.includes("--validate")) process.exit(0);

const url = opt("url") ?? process.env.MCP_URL ?? "https://munichmcp.duckdns.org/mcp";
const only = opt("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const report = await checkSources({ mcpUrl: url, only });
const md = markdown(report);
console.log(md);
if (opt("md")) fs.writeFileSync(opt("md")!, md);
if (opt("json")) fs.writeFileSync(opt("json")!, JSON.stringify(report, null, 2));
process.exit(report.summary.failing ? 1 : report.summary.degraded ? 2 : 0);

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { config } from "../config.js";
import type { Citation } from "../lib/sources.js";
import { ManifestSchema, type Manifest } from "./manifest.js";

/**
 * The source catalog: every data source munichMCP uses, one YAML manifest per
 * source in catalog/. Loaded synchronously at startup so generic sources can
 * register their find_nearby categories like built-in ones.
 */

export interface CatalogError {
  file: string;
  error: string;
}

export function loadCatalog(dir = config.catalogDir): { manifests: Manifest[]; errors: CatalogError[] } {
  const manifests: Manifest[] = [];
  const errors: CatalogError[] = [];
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  } catch {
    return { manifests, errors: [{ file: dir, error: "catalog directory not found" }] };
  }
  const seen = new Set<string>();
  for (const f of files) {
    try {
      const raw = YAML.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const m = ManifestSchema.parse(raw);
      if (`${m.id}.yaml` !== f && `${m.id}.yml` !== f) throw new Error(`file name must be ${m.id}.yaml`);
      if (seen.has(m.id)) throw new Error(`duplicate id ${m.id}`);
      seen.add(m.id);
      manifests.push(m);
    } catch (e) {
      errors.push({ file: f, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { manifests, errors };
}

const loaded = loadCatalog();
for (const e of loaded.errors) console.warn(`[catalog] ${e.file}: ${e.error}`);

export const catalog: readonly Manifest[] = loaded.manifests;
export const catalogErrors: readonly CatalogError[] = loaded.errors;

export function getManifest(id: string): Manifest | undefined {
  return catalog.find((m) => m.id === id);
}

export function manifestCitation(m: Manifest, retrieved?: number): Citation {
  return {
    name: m.name,
    publisher: m.publisher,
    license: m.licence,
    url: m.homepage,
    retrieved: retrieved === undefined ? undefined : new Date(retrieved).toISOString(),
  };
}

/** Fill "{column}" placeholders; a bare column name returns that column. */
export function fillTemplate(template: string, row: Record<string, unknown>): string | undefined {
  if (!template.includes("{")) {
    const v = row[template];
    return v === undefined || v === null || v === "" ? undefined : String(v);
  }
  const out = template.replace(/\{([^}]+)\}/g, (_, k: string) => {
    const v = row[k.trim()];
    return v === undefined || v === null ? "" : String(v);
  });
  return out.replace(/\s+/g, " ").trim() || undefined;
}

/** Resolve a source's credential from the environment (never logged, never returned). */
export function resolveAuth(m: Manifest): { headers: Record<string, string>; query: Record<string, string> } {
  if (!m.auth) return { headers: {}, query: {} };
  const secret = process.env[m.auth.secret_env];
  if (!secret) throw new Error(`Source ${m.id} needs the secret ${m.auth.secret_env}, which is not configured.`);
  return m.auth.type === "header" ? { headers: { [m.auth.param]: secret }, query: {} } : { headers: {}, query: { [m.auth.param]: secret } };
}

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { InputError } from "../tools/util.js";

/**
 * Data source proposals from anyone (via the propose_data_source tool, or a
 * GitHub issue). Stored as JSON files; the intake agent turns them into pull
 * requests. Proposals are untrusted input: agents treat them as data only.
 */

export interface Proposal {
  id: string;
  created: string;
  status: "new" | "in_progress" | "pr_opened" | "rejected" | "duplicate";
  name: string;
  url: string;
  docs_url?: string;
  description: string;
  questions: string[];
  licence?: string;
  needs_credentials: boolean;
  submitted_by?: string;
  note?: string;
  pr_url?: string;
  updated?: string;
}

const dir = () => path.join(config.dataDir, "proposals");
const MAX_PER_DAY = 25;
const MAX_OPEN = 200;

/** Never store anything that looks like a secret. */
export function looksLikeSecret(s: string): boolean {
  return /\b(sk-|ghp_|github_pat_|xox[bap]-|AKIA)[A-Za-z0-9_-]{8,}/.test(s) || /\b(api[_-]?key|token|secret|password)\s*[:=]\s*\S{8,}/i.test(s) || /[A-Za-z0-9+/_-]{40,}/.test(s.replace(/https?:\/\/\S+/g, ""));
}

export async function listProposals(status?: Proposal["status"]): Promise<Proposal[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(dir(), f), "utf8")) as Proposal));
  return all.filter((p) => !status || p.status === status).sort((a, b) => b.created.localeCompare(a.created));
}

export async function getProposal(id: string): Promise<Proposal | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(), `${id.replace(/[^\w-]/g, "")}.json`), "utf8")) as Proposal;
  } catch {
    return undefined;
  }
}

export async function addProposal(input: Omit<Proposal, "id" | "created" | "status">): Promise<{ proposal: Proposal; duplicate: boolean }> {
  const text = [input.name, input.url, input.docs_url, input.description, input.licence, input.submitted_by, ...input.questions].filter(Boolean).join("\n");
  if (looksLikeSecret(text)) throw new InputError("This looks like it contains an API key or password. Never send credentials here; describe the access type instead, and a maintainer will arrange the key through the deployment's secret store.");
  const existing = await listProposals();
  const dup = existing.find((p) => p.url.replace(/\/$/, "") === input.url.replace(/\/$/, ""));
  if (dup) return { proposal: dup, duplicate: true };
  const today = new Date().toISOString().slice(0, 10);
  if (existing.filter((p) => p.created.startsWith(today)).length >= MAX_PER_DAY) throw new InputError("Too many proposals today; please try again tomorrow or open a GitHub issue.");
  if (existing.filter((p) => p.status === "new").length >= MAX_OPEN) throw new InputError("The proposal inbox is full; please open a GitHub issue instead.");
  const id = `P-${createHash("sha256").update(input.url + Date.now()).digest("hex").slice(0, 8)}`;
  const proposal: Proposal = { id, created: new Date().toISOString(), status: "new", ...input };
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), `${id}.json`), JSON.stringify(proposal, null, 2));
  return { proposal, duplicate: false };
}

export async function updateProposal(id: string, patch: Pick<Proposal, "status"> & Partial<Pick<Proposal, "note" | "pr_url">>): Promise<Proposal> {
  const p = await getProposal(id);
  if (!p) throw new Error(`No proposal ${id}`);
  const next = { ...p, ...patch, updated: new Date().toISOString() };
  await fs.writeFile(path.join(dir(), `${p.id}.json`), JSON.stringify(next, null, 2));
  return next;
}

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { catalog } from "../catalog/catalog.js";
import { looksLikeSecret } from "../catalog/proposals.js";
import { config } from "../config.js";
import { haversine, withinMunich, type LonLat } from "../lib/geo.js";
import { InputError } from "../tools/util.js";

/**
 * munichMCP's own data: contributions from residents, made through any
 * assistant. Two kinds:
 * - record: a new data point in a community collection (a barrier, an idea).
 * - data_issue: feedback on existing data (wrong, outdated, missing, broken).
 * Every contribution passes automatic checks on the way in (place, personal
 * data, credentials, duplicates, volume) and stays pending until a person
 * reviews it. Published records are CC0 and exported at /community.geojson.
 * Stored as one JSON file per contribution; contribution text is untrusted.
 */

export interface Collection {
  id: string;
  label: string;
  description: string;
  location: "required" | "optional";
  examples: string[];
  /** Set when the city already runs a channel for this: hand over instead of storing a copy. */
  official?: { name: string; url: string; note: string };
  origin: "builtin" | "approved";
  created?: string;
}

export const BUILTIN_COLLECTIONS: Collection[] = [
  {
    id: "barriers",
    label: "Accessibility barriers",
    description:
      "Obstacles for people using a wheelchair, walker or pram, or with impaired sight: steps without a ramp, missing kerb drops, blocked pavements, missing tactile paving, entrances only reachable by stairs.",
    location: "required",
    examples: ["Kerb at the crossing has no drop", "Side entrance of the library only via stairs"],
    origin: "builtin",
  },
  {
    id: "ideas",
    label: "Ideas for the neighbourhood",
    description: "Suggestions for a specific place: a bench, shade, a bike rack, a safer crossing, a drinking fountain, more greenery.",
    location: "optional",
    examples: ["A bench at the bus stop", "Bike racks in front of the school"],
    origin: "builtin",
  },
  {
    id: "defects",
    label: "Damage and defects in public space",
    description: "Potholes, broken street lights or traffic lights, damaged signs or playgrounds, graffiti, overflowing bins.",
    location: "required",
    examples: ["Pothole in the cycle lane", "Street light out"],
    official: {
      name: "Mach München besser (Baureferat)",
      url: "https://machmuenchenbesser.de",
      note: "The city's own reporting platform: reports reach the responsible department directly and get a public status.",
    },
    origin: "builtin",
  },
];

export type IssueType = "wrong" | "outdated" | "missing" | "broken" | "other";
export const RECORD_STATUSES = ["pending", "published", "rejected", "duplicate"] as const;
export const ISSUE_STATUSES = ["open", "acknowledged", "resolved", "forwarded", "rejected"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export interface Contribution {
  id: string;
  kind: "record" | "data_issue";
  status: RecordStatus | IssueStatus;
  created: string;
  updated?: string;
  title: string;
  description: string;
  /** record: collection id; new_collection when it does not exist yet. */
  collection?: string;
  new_collection?: boolean;
  /** data_issue: catalog source id and/or the tool that returned the data. */
  source_id?: string;
  tool?: string;
  issue_type?: IssueType;
  suggested_fix?: string;
  lat?: number;
  lon?: number;
  place?: string;
  properties?: Record<string, string | number | boolean>;
  evidence_url?: string;
  /** Further people who reported the same thing. */
  confirmations: number;
  /** Results of the automatic checks, for the reviewer. */
  checks: string[];
  /** Public note from the reviewer. */
  note?: string;
  duplicate_of?: string;
}

const MAX_PER_DAY = 300;
const MAX_PENDING = 1000;
const DUPLICATE_RADIUS_M = 30;
const DUPLICATE_DAYS = 90;

const dir = () => path.join(config.dataDir, "contributions");
let cache: Map<string, Contribution> | undefined;
let approved: Collection[] | undefined;

/** Forget the in-memory index (tests switch data directories). */
export function resetContributions(): void {
  cache = undefined;
  approved = undefined;
}

async function load(): Promise<Map<string, Contribution>> {
  if (cache) return cache;
  const m = new Map<string, Contribution>();
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir())).filter((f) => /^C-[0-9a-f]+\.json$/.test(f));
  } catch {
    /* empty store */
  }
  for (const f of files) {
    const c = JSON.parse(await fs.readFile(path.join(dir(), f), "utf8")) as Contribution;
    m.set(c.id, c);
  }
  cache = m;
  return m;
}

async function save(c: Contribution): Promise<Contribution> {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), `${c.id}.json`), JSON.stringify(c, null, 2));
  (await load()).set(c.id, c);
  return c;
}

export async function listCollections(): Promise<Collection[]> {
  if (!approved) {
    try {
      approved = JSON.parse(await fs.readFile(path.join(dir(), "collections.json"), "utf8")) as Collection[];
    } catch {
      approved = [];
    }
  }
  return [...BUILTIN_COLLECTIONS, ...approved];
}

export async function getCollection(id: string): Promise<Collection | undefined> {
  return (await listCollections()).find((c) => c.id === id);
}

async function approveCollection(c: Collection): Promise<void> {
  await listCollections();
  approved = [...approved!.filter((x) => x.id !== c.id), c];
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), "collections.json"), JSON.stringify(approved, null, 2));
}

/** Returns what kind of personal data the text seems to contain, if any. */
export function personalDataHint(s: string): string | undefined {
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(s)) return "an e-mail address";
  if (/(\+\d{2}|\b0)[\d\s/()-]{7,}\d/.test(s)) return "a phone number";
  if (/\bDE\d{2}(?:\s?\d{4}){4}\s?\d{2}\b/.test(s)) return "bank details";
  return undefined;
}

function screen(parts: (string | undefined)[]): string[] {
  const text = parts.filter(Boolean).join("\n");
  if (looksLikeSecret(text)) throw new InputError("This looks like it contains a key or password. Never send credentials; describe the problem without them.");
  const pd = personalDataHint(text);
  if (pd) throw new InputError(`This seems to contain ${pd}. Contributions are published, so please remove names, contact details and other personal data and try again.`);
  return ["no credentials found", "no personal data found"];
}

async function enforceVolume(all: Contribution[]): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (all.filter((c) => c.created.startsWith(today)).length >= MAX_PER_DAY) throw new InputError("Too many contributions today; please try again tomorrow.");
  if (all.filter((c) => c.status === "pending" || c.status === "open").length >= MAX_PENDING) throw new InputError("The review queue is full right now; please try again later.");
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));

function similar(a: string, b: string): boolean {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const wb = words(b);
  return [...words(a)].some((w) => wb.has(w));
}

function newId(): string {
  return `C-${randomBytes(4).toString("hex")}`;
}

function checkPoint(lat?: number, lon?: number): LonLat | undefined {
  if (typeof lat !== "number" || typeof lon !== "number") return undefined;
  if (!withinMunich({ lat, lon }, 0)) throw new InputError("This place is outside the City of Munich; munichMCP only collects data for Munich.");
  return { lat, lon };
}

export interface RecordInput {
  collection: string;
  title: string;
  description: string;
  lat?: number;
  lon?: number;
  place?: string;
  properties?: Record<string, string | number | boolean>;
  evidence_url?: string;
}

export type AddRecordResult =
  | { outcome: "stored"; contribution: Contribution }
  | { outcome: "confirmed"; contribution: Contribution }
  | { outcome: "official_channel"; collection: Collection };

export async function addRecord(input: RecordInput): Promise<AddRecordResult> {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(input.collection)) throw new InputError("Collection ids are lowercase words with hyphens, e.g. 'barriers', 'ideas' or 'bike-parking-wishes'.");
  const collection = await getCollection(input.collection);
  if (collection?.official) return { outcome: "official_channel", collection };
  const checks = screen([input.title, input.description, input.place, input.evidence_url, ...Object.entries(input.properties ?? {}).map(([k, v]) => `${k}: ${v}`)]);
  const point = checkPoint(input.lat, input.lon);
  if (collection?.location === "required" && !point) throw new InputError(`"${collection.label}" needs a place: pass an address or coordinates.`);
  if (point) checks.unshift("place is in Munich");
  const all = [...(await load()).values()];
  if (point) {
    const since = new Date(Date.now() - DUPLICATE_DAYS * 86_400_000).toISOString();
    const dup = all.find(
      (c) =>
        c.kind === "record" &&
        c.collection === input.collection &&
        (c.status === "pending" || c.status === "published") &&
        c.created >= since &&
        typeof c.lat === "number" &&
        haversine(point, { lat: c.lat, lon: c.lon! }) <= DUPLICATE_RADIUS_M &&
        similar(c.title, input.title),
    );
    if (dup) return { outcome: "confirmed", contribution: await save({ ...dup, confirmations: dup.confirmations + 1, updated: new Date().toISOString() }) };
  }
  await enforceVolume(all);
  if (!collection) checks.push(`new collection "${input.collection}": a maintainer decides whether to open it`);
  const c: Contribution = {
    id: newId(),
    kind: "record",
    status: "pending",
    created: new Date().toISOString(),
    title: input.title.trim(),
    description: input.description.trim(),
    collection: input.collection,
    ...(collection ? {} : { new_collection: true }),
    ...(point ? { lat: +point.lat.toFixed(6), lon: +point.lon.toFixed(6) } : {}),
    ...(input.place ? { place: input.place } : {}),
    ...(input.properties && Object.keys(input.properties).length ? { properties: input.properties } : {}),
    ...(input.evidence_url ? { evidence_url: input.evidence_url } : {}),
    confirmations: 0,
    checks,
  };
  return { outcome: "stored", contribution: await save(c) };
}

export interface IssueInput {
  source_id?: string;
  tool?: string;
  issue_type: IssueType;
  title: string;
  description: string;
  suggested_fix?: string;
  lat?: number;
  lon?: number;
  place?: string;
  evidence_url?: string;
}

export async function addIssue(input: IssueInput): Promise<{ contribution: Contribution; confirmed: boolean }> {
  if (input.source_id && !catalog.some((m) => m.id === input.source_id)) throw new InputError(`Unknown source "${input.source_id}". Use data_sources to find the id, or leave it out and name the tool instead.`);
  if (!input.source_id && !input.tool) throw new InputError("Say which data is affected: pass source_id (see data_sources) or the tool that returned it.");
  const checks = screen([input.title, input.description, input.suggested_fix, input.place, input.evidence_url]);
  const point = checkPoint(input.lat, input.lon);
  const all = [...(await load()).values()];
  const dup = all.find(
    (c) =>
      c.kind === "data_issue" &&
      (c.status === "open" || c.status === "acknowledged") &&
      (c.source_id ?? c.tool) === (input.source_id ?? input.tool) &&
      similar(c.title, input.title) &&
      (!point || typeof c.lat !== "number" || haversine(point, { lat: c.lat, lon: c.lon! }) <= DUPLICATE_RADIUS_M),
  );
  if (dup) return { contribution: await save({ ...dup, confirmations: dup.confirmations + 1, updated: new Date().toISOString() }), confirmed: true };
  await enforceVolume(all);
  const c: Contribution = {
    id: newId(),
    kind: "data_issue",
    status: "open",
    created: new Date().toISOString(),
    title: input.title.trim(),
    description: input.description.trim(),
    ...(input.source_id ? { source_id: input.source_id } : {}),
    ...(input.tool ? { tool: input.tool } : {}),
    issue_type: input.issue_type,
    ...(input.suggested_fix ? { suggested_fix: input.suggested_fix } : {}),
    ...(point ? { lat: +point.lat.toFixed(6), lon: +point.lon.toFixed(6) } : {}),
    ...(input.place ? { place: input.place } : {}),
    ...(input.evidence_url ? { evidence_url: input.evidence_url } : {}),
    confirmations: 0,
    checks,
  };
  return { contribution: await save(c), confirmed: false };
}

export async function getContribution(id: string): Promise<Contribution | undefined> {
  return (await load()).get(id);
}

export async function listContributions(f: { kind?: Contribution["kind"]; status?: string; collection?: string; source_id?: string } = {}): Promise<Contribution[]> {
  return [...(await load()).values()]
    .filter((c) => (!f.kind || c.kind === f.kind) && (!f.status || c.status === f.status) && (!f.collection || c.collection === f.collection) && (!f.source_id || c.source_id === f.source_id))
    .sort((a, b) => b.created.localeCompare(a.created));
}

/** Published records, optionally in one collection and near a point (distance-sorted). */
export async function publishedRecords(opts: { collection?: string; near?: LonLat; radiusM?: number; limit?: number } = {}): Promise<(Contribution & { distance_m?: number })[]> {
  let items: (Contribution & { distance_m?: number })[] = await listContributions({ kind: "record", status: "published", collection: opts.collection });
  if (opts.near) {
    const near = opts.near;
    items = items
      .filter((c) => typeof c.lat === "number")
      .map((c) => ({ ...c, distance_m: Math.round(haversine(near, { lat: c.lat!, lon: c.lon! })) }))
      .filter((c) => c.distance_m! <= (opts.radiusM ?? 1500))
      .sort((a, b) => a.distance_m! - b.distance_m!);
  }
  return items.slice(0, opts.limit ?? 50);
}

export interface ReviewInput {
  status: RecordStatus | IssueStatus;
  note?: string;
  duplicate_of?: string;
  collection_label?: string;
  collection_description?: string;
}

export async function reviewContribution(id: string, r: ReviewInput): Promise<Contribution> {
  const c = await getContribution(id);
  if (!c) throw new InputError(`No contribution ${id}.`);
  const allowed: readonly string[] = c.kind === "record" ? RECORD_STATUSES : ISSUE_STATUSES;
  if (!allowed.includes(r.status)) throw new InputError(`A ${c.kind} can be set to: ${allowed.join(", ")}.`);
  const next: Contribution = { ...c, status: r.status, updated: new Date().toISOString(), ...(r.note ? { note: r.note } : {}), ...(r.duplicate_of ? { duplicate_of: r.duplicate_of } : {}) };
  if (c.kind === "record" && r.status === "published" && c.new_collection) {
    await approveCollection({
      id: c.collection!,
      label: r.collection_label ?? c.collection!.replace(/-/g, " "),
      description: r.collection_description ?? "",
      location: "optional",
      examples: [c.title],
      origin: "approved",
      created: new Date().toISOString(),
    });
    delete next.new_collection;
  }
  return save(next);
}

/** What anyone may see about a contribution (pending text stays with reviewers). */
export function publicView(c: Contribution) {
  const visible = c.status === "published" || c.kind === "data_issue";
  return {
    id: c.id,
    kind: c.kind,
    status: c.status,
    created: c.created,
    updated: c.updated,
    collection: c.collection,
    source_id: c.source_id,
    title: c.title,
    ...(visible ? { description: c.description, lat: c.lat, lon: c.lon, place: c.place, properties: c.properties } : {}),
    confirmations: c.confirmations,
    note: c.note,
  };
}

export async function communityStats() {
  const all = [...(await load()).values()];
  const byCollection: Record<string, { published: number; pending: number }> = {};
  const issuesBySource: Record<string, number> = {};
  for (const c of all) {
    if (c.kind === "record" && c.collection) {
      const b = (byCollection[c.collection] ??= { published: 0, pending: 0 });
      if (c.status === "published") b.published++;
      if (c.status === "pending") b.pending++;
    }
    if (c.kind === "data_issue" && (c.status === "open" || c.status === "acknowledged")) issuesBySource[c.source_id ?? `tool:${c.tool}`] = (issuesBySource[c.source_id ?? `tool:${c.tool}`] ?? 0) + 1;
  }
  return {
    records_published: all.filter((c) => c.kind === "record" && c.status === "published").length,
    records_pending: all.filter((c) => c.kind === "record" && c.status === "pending").length,
    issues_open: all.filter((c) => c.kind === "data_issue" && (c.status === "open" || c.status === "acknowledged")).length,
    issues_resolved: all.filter((c) => c.kind === "data_issue" && c.status === "resolved").length,
    by_collection: byCollection,
    issues_by_source: issuesBySource,
  };
}

/** Published records as GeoJSON (CC0 1.0). */
export async function communityGeoJson() {
  const items = await publishedRecords({ limit: 100_000 });
  return {
    type: "FeatureCollection",
    license: "CC0-1.0",
    generated: new Date().toISOString(),
    features: items
      .filter((c) => typeof c.lat === "number")
      .map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        properties: { id: c.id, collection: c.collection, title: c.title, description: c.description, place: c.place, created: c.created, confirmations: c.confirmations, ...(c.properties ?? {}) },
      })),
  };
}

/** The owner to route a data issue to (from the source manifest). */
export function issueOwner(sourceId?: string): string | undefined {
  return sourceId ? catalog.find((m) => m.id === sourceId)?.owner : undefined;
}

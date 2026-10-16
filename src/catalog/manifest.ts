import { z } from "zod";

/**
 * A source manifest (catalog/<id>.yaml) describes one data source: who
 * publishes it, under which licence, how munichMCP uses it, and how to tell
 * that it still works. Simple point datasets need nothing else: the generic
 * adapters turn the manifest into a find_nearby category. Complex sources
 * point to their TypeScript module and only declare metadata and checks.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes");

/** "{column}" templates or a plain column name. */
const field = z.string().min(1);

export const CheckSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("http"),
    name: z.string().optional(),
    url: z.url(),
    method: z.enum(["GET", "HEAD"]).default("GET"),
    expect_status: z.number().int().default(200),
    /** Regex that the first 200 kB of the body must match. */
    expect_text: z.string().optional(),
  }),
  z.object({
    type: z.literal("ckan"),
    name: z.string().optional(),
    dataset: z.string(),
    /** Expected CKAN license_id; a change means the terms must be reviewed. */
    licence_id: z.string().optional(),
    /** Fail when the dataset metadata was not modified for longer than this. */
    max_age_days: z.number().positive().optional(),
    /** Columns the newest CSV resource must contain (schema drift detector). */
    columns: z.array(z.string()).optional(),
    resource: z.string().optional(),
  }),
  z.object({
    type: z.literal("wfs"),
    name: z.string().optional(),
    layer: z.string().regex(/^\w+:\w+$/),
    min_features: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("tool"),
    name: z.string().optional(),
    tool: z.string(),
    args: z.record(z.string(), z.unknown()).default({}),
    /** Regex the tool's text answer must match: a known answer. */
    expect: z.string(),
  }),
]);
export type Check = z.infer<typeof CheckSchema>;

const category = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(3),
  group: z.enum(["everyday", "family", "social", "mobility", "culture", "isar"]),
});

const pointFields = z.object({
  name: field,
  address: field.optional(),
  url: field.optional(),
  details: z.record(z.string(), field).default({}),
});

export const ImplementationSchema = z.discriminatedUnion("kind", [
  /** Hand-written TypeScript; the manifest documents and monitors it. */
  z.object({ kind: z.literal("code"), module: z.string(), source_id: z.string() }),
  /** Newest CSV resource of an open data portal dataset with lat/lon columns. */
  z.object({
    kind: z.literal("ckan-csv-points"),
    dataset: z.string(),
    resource: z.string().optional(),
    category,
    fields: pointFields.extend({ lat: field, lon: field }),
  }),
  /** A GeoPortal WFS layer with point (or polygon) features. */
  z.object({ kind: z.literal("wfs-points"), layer: z.string().regex(/^\w+:\w+$/), category, fields: pointFields }),
]);
export type Implementation = z.infer<typeof ImplementationSchema>;

export const ManifestSchema = z.object({
  id,
  name: z.string().min(3),
  description: z.string().min(10),
  publisher: z.string().min(2),
  licence: z.string().min(2),
  licence_url: z.url().optional(),
  homepage: z.url(),
  access: z.enum(["open-data", "public-api", "tolerated-unofficial", "agreement"]),
  status: z.enum(["active", "proposed", "deprecated"]).default("active"),
  /** Who reviews changes to this source (GitHub handle or team). */
  owner: z.string().default("@munichmcp/maintainers"),
  implementation: ImplementationSchema,
  /**
   * Credentials, if a source needs them. The value is the NAME of an
   * environment variable (a deployment secret), never the key itself.
   */
  auth: z
    .object({ type: z.enum(["header", "query"]), param: z.string(), secret_env: z.string().regex(/^[A-Z][A-Z0-9_]*$/), expires: z.string().optional() })
    .optional(),
  refresh: z.string().default("daily"),
  /** Example questions this source answers (used in docs and evals). */
  questions: z.array(z.string()).default([]),
  checks: z.array(CheckSchema).min(1, "every source needs at least one health check"),
  added: z.string().optional(),
  reviewed: z.string().optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

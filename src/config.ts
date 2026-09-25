import path from "node:path";

const root = process.cwd();
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, "data"));

export const config = {
  name: "munichMCP",
  version: "0.1.0",
  port: Number(process.env.PORT ?? 8420),
  host: process.env.HOST ?? "0.0.0.0",
  /** Public base URL, used for links in tool results and the landing page. */
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:8420").replace(/\/$/, ""),
  dataDir,
  cacheDir: path.join(dataDir, "cache"),
  /** Live wiki (writable). Seeded from `wikiSeedDir` on first boot. */
  wikiDir: path.resolve(process.env.WIKI_DIR ?? path.join(dataDir, "wiki")),
  wikiSeedDir: path.resolve(process.env.WIKI_SEED_DIR ?? path.join(root, "wiki")),
  uiDistDir: path.resolve(process.env.UI_DIST_DIR ?? path.join(root, "dist", "ui")),
  /** Bearer token for the maintainer endpoint (wiki write tools). Disabled when unset. */
  maintainerToken: process.env.WIKI_MAINTAINER_TOKEN || undefined,
  /** Run the deterministic wiki inbox collector every N hours (0 disables). */
  collectorIntervalHours: Number(process.env.COLLECTOR_INTERVAL_HOURS ?? 24),
  /** Skip warming the dataset caches at startup (tests). */
  lazyData: process.env.LAZY_DATA === "1",
  userAgent:
    process.env.USER_AGENT ??
    "munichMCP/0.1 (unofficial civic data MCP server; https://github.com/pepae/munichMCP)",
};

/** Rough bounding box of the City of Munich (lon/lat). */
export const MUNICH_BBOX = { minLon: 11.36, minLat: 48.06, maxLon: 11.73, maxLat: 48.25 };
export const MUNICH_CENTER = { lat: 48.1374, lon: 11.5755 };

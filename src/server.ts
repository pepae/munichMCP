import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { config } from "./config.js";
import { createMaintainerServer, createPublicServer } from "./mcp.js";
import { renderLanding, renderParticipate, renderStatus, renderWikiIndex, renderWikiPage } from "./web.js";
import { catalog } from "./catalog/catalog.js";
import { latestReport, scheduleHealthChecks } from "./catalog/health.js";
import { listProposals } from "./catalog/proposals.js";
import { communityGeoJson, communityStats, listCollections, listContributions, publishedRecords } from "./community/contributions.js";
import { warmUp, scheduleRefresh } from "./warmup.js";
import { scheduleCollector } from "./sources/wiki-collector.js";
import { wiki } from "./sources/wiki.js";

const publicHost = new URL(config.publicUrl).hostname;
const allowedHosts = (process.env.ALLOWED_HOSTS ?? `${publicHost},localhost,127.0.0.1`).split(",").map((h) => h.trim()).filter(Boolean);

const app = createMcpExpressApp({ host: config.host, allowedHosts, jsonLimit: "2mb" });
app.set("trust proxy", 1);
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version", "WWW-Authenticate"],
    allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID", "Accept"],
  }),
);

// Gentle per-client rate limit: protects the upstream city services we call.
const buckets = new Map<string, { tokens: number; at: number }>();
function rateLimit(perMinute: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    if (b.tokens < 1) {
      res.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Rate limit exceeded, slow down." }, id: null });
      return;
    }
    b.tokens -= 1;
    buckets.set(key, b);
    if (buckets.size > 5000) buckets.clear();
    next();
  };
}

const onerror = (e: Error) => console.warn(`[mcp] ${e.message}`);
const publicHandler = toNodeHandler(createMcpHandler(() => createPublicServer(), { onerror }));
const maintainerHandler = toNodeHandler(createMcpHandler(() => createMaintainerServer(), { onerror }));

app.all("/mcp", rateLimit(180), (req, res) => publicHandler(req, res, req.body));

function requireMaintainer(req: Request, res: Response, next: NextFunction) {
  const token = config.maintainerToken;
  if (!token) {
    res.status(404).json({ error: "Maintainer endpoint disabled (WIKI_MAINTAINER_TOKEN not set)." });
    return;
  }
  const got = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).set("WWW-Authenticate", 'Bearer realm="munichmcp-maintainer"').json({ error: "Unauthorized" });
    return;
  }
  next();
}
app.all("/maintainer/mcp", requireMaintainer, (req, res) => maintainerHandler(req, res, req.body));

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: config.name, version: config.version, wiki_pages: wiki.size, time: new Date().toISOString() });
});
app.get("/", (_req, res) => res.type("html").send(renderLanding()));
app.get("/playground", (_req, res) => {
  res.sendFile(path.join(config.uiDistDir, "playground.html"), (err) => {
    if (err && !res.headersSent) res.status(404).send("Playground not built (npm run build:ui).");
  });
});
app.get("/status", async (_req, res) => {
  res.type("html").send(renderStatus(await latestReport(), await listProposals(), (await communityStats()).issues_by_source));
});
app.get("/status.json", async (_req, res) => {
  const report = await latestReport();
  const proposals = (await listProposals()).map(({ id, name, url, status, created, pr_url }) => ({ id, name, url, status, created, pr_url }));
  res.json({ sources: catalog.length, report, proposals, community: await communityStats() });
});
app.get("/participate", async (_req, res) => {
  const reports = [...(await listContributions({ kind: "data_issue", status: "open" })), ...(await listContributions({ kind: "data_issue", status: "acknowledged" }))];
  res.type("html").send(renderParticipate(await listCollections(), await communityStats(), await publishedRecords({ limit: 20 }), reports.slice(0, 50)));
});
app.get("/community.geojson", async (_req, res) => {
  res.type("application/geo+json").send(JSON.stringify(await communityGeoJson()));
});
app.get("/wiki", (_req, res) => res.type("html").send(renderWikiIndex()));
app.get(/^\/wiki\/(.+)$/, (req, res) => {
  const slug = decodeURIComponent((req.params as unknown as string[])[0]);
  const html = renderWikiPage(slug);
  if (!html) res.status(404).type("html").send(renderWikiIndex(`No page "${slug}".`));
  else res.type("html").send(html);
});

async function main() {
  await wiki.init(config.wikiSeedDir);
  console.log(`[wiki] loaded ${wiki.size} pages from ${config.wikiDir}`);
  app.listen(config.port, config.host, () => {
    console.log(`munichMCP listening on http://${config.host}:${config.port}/mcp (public URL ${config.publicUrl})`);
  });
  if (!config.lazyData) {
    warmUp().catch((e) => console.warn(`[warmup] ${String(e)}`));
    scheduleRefresh();
  }
  scheduleCollector(config.collectorIntervalHours);
  scheduleHealthChecks(config.healthIntervalHours);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

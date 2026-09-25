/**
 * Call a tool on the token-protected maintainer endpoint.
 *   MUNICHMCP_URL=https://munichmcp.duckdns.org WIKI_MAINTAINER_TOKEN=... \
 *     npx tsx scripts/maintainer.ts wiki_inbox '{"limit":10}'
 * Tip: pass the arguments JSON in a file with @args.json.
 */
import fs from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const base = (process.env.MUNICHMCP_URL ?? "http://localhost:8420").replace(/\/$/, "");
const token = process.env.WIKI_MAINTAINER_TOKEN;
if (!token) throw new Error("Set WIKI_MAINTAINER_TOKEN");
const [tool, rawArgs = "{}"] = process.argv.slice(2);
if (!tool) throw new Error("usage: maintainer.ts <tool> [json-args | @file.json]");
const args = JSON.parse(rawArgs.startsWith("@") ? fs.readFileSync(rawArgs.slice(1), "utf8") : rawArgs);

const client = new Client({ name: "munichmcp-maintainer-cli", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/maintainer/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const r: any = await client.callTool({ name: tool, arguments: args });
console.log((r.content ?? []).map((c: any) => c.text ?? "").join("\n"));
await client.close();
process.exit(r.isError ? 1 : 0);

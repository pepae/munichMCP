import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { config } from "../config.js";
import { SOURCES, type SourceInfo } from "../lib/sources.js";
import { wiki } from "../sources/wiki.js";
import { defineTool } from "./util.js";

export function registerAboutTools(server: McpServer) {
  defineTool(
    server,
    "about_munichmcp",
    {
      title: "About munichMCP and its data sources",
      description: "What munichMCP is, which data sources it uses (publisher, licence, access type), and caveats. Use when the user asks where data comes from or how reliable it is.",
      input: z.object({}),
      annotations: { openWorldHint: false },
    },
    async () => {
      const rows = (Object.values(SOURCES) as SourceInfo[]).map((s) => `- ${s.name}: ${s.publisher}; licence: ${s.license}; access: ${s.access}${s.notes ? ` (${s.notes})` : ""}. ${s.url}`);
      return {
        text:
          `munichMCP ${config.version} is an unofficial MCP server for the City of Munich, built as a proposal for an official city MCP. ` +
          `It is not affiliated with or endorsed by the Landeshauptstadt München. It reads official open data and public city services live or from daily caches, and ` +
          `every result names its source. The wiki currently has ${wiki.size} agent-maintained pages.\n\nData sources:\n${rows.join("\n")}\n\n` +
          `Caveats: open data can lag behind reality; the MVG realtime API is unofficial and only tolerated for moderate non-commercial use; the rent calculation follows the published Mietspiegel method but is not legal advice; ` +
          `noise levels are modelled (EU noise maps 2022, 4 m above ground, loudest side of the building) and flood maps cover rivers, not flash floods from heavy rain; ` +
          `budget figures are ordinary income and expenses of the core budget (accrual accounting). ` +
          `Web: ${config.publicUrl}`,
        data: { version: config.version, sources: Object.values(SOURCES), wiki_pages: wiki.size, url: config.publicUrl },
      };
    },
  );
}

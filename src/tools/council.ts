import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { councilSearch } from "../sources/council.js";
import { citationsMd, defineTool } from "./util.js";

export function registerCouncilTools(server: McpServer) {
  defineTool(
    server,
    "council_search",
    {
      title: "City council & district committee motions",
      description:
        "Search recent motions and inquiries of the Munich city council (Stadtrat) and the 25 district committees (Bezirksausschüsse) from the official council information system (RIS). " +
        "Each item has number, subject, type, who submitted it, date and a link to the RIS record. Leave query empty for the latest items. " +
        "Coverage: the RIS feeds plus everything munichMCP has archived since it started collecting.",
      input: z.object({
        query: z.string().max(200).optional().describe("Keywords, e.g. 'Radweg Lindwurmstraße', 'Wohnungsleerstand', 'Tram Westtangente'"),
        body: z.enum(["stadtrat", "bezirksausschuss", "all"]).default("all"),
        limit: z.number().int().min(1).max(50).default(15),
      }),
    },
    async (a) => {
      const r = await councilSearch({ query: a.query, body: a.body, limit: a.limit });
      const lines = r.items.map(
        (i) =>
          `- ${i.date?.slice(0, 10) ?? "?"} ${i.body === "stadtrat" ? "Stadtrat" : "BA"} ${i.number}: ${i.subject}` +
          `${i.kind ? ` (${i.kind})` : ""}${i.submitted_by ? `, by ${i.submitted_by}` : ""}\n  ${i.url}`,
      );
      return {
        text:
          `${r.total} council item(s)${a.query ? ` matching "${a.query}"` : ""} (covered period ${r.window}):\n\n` +
          (lines.join("\n") || "None found. The feeds only reach back a few weeks; try the wiki (wiki_search) for older topics.") +
          citationsMd([r.citation]),
        data: { query: a.query, total: r.total, window: r.window, items: r.items, sources: [r.citation] },
      };
    },
  );
}

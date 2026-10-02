import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getService, searchServices } from "../sources/services.js";
import { citationsMd, defineTool } from "./util.js";

export function registerServiceTools(server: McpServer) {
  defineTool(
    server,
    "search_city_services",
    {
      title: "Search City of Munich services",
      description:
        "Search the City of Munich's official service directory (Dienstleistungsfinder, ~1,450 articles: registration of residence, ID cards and passports, driving licences, " +
        "residence permits, parking permits, business registration, marriage, childcare, waste, dogs, ...) and the list of the city's online services. " +
        "Returns the matching official articles with summary and link, plus matching online application forms. Search in German for best results " +
        "(e.g. 'Wohnsitz anmelden', 'Personalausweis beantragen', 'Anwohnerparkausweis'); English terms also work partially.",
      input: z.object({
        query: z.string().min(2).max(200),
        limit: z.number().int().min(1).max(15).default(6),
        language: z.enum(["de", "en"]).optional().describe("Prefer articles in this language when available"),
      }),
    },
    async ({ query, limit, language }) => {
      const r = await searchServices(query, { limit, language });
      const text =
        `City services matching "${query}":\n\n` +
        (r.hits.map((h, i) => `${i + 1}. ${h.name} [id ${h.id}]\n   ${h.summary}\n   ${h.url}`).join("\n") || "No matching service article.") +
        (r.online.length ? `\n\nOnline services (apply online):\n${r.online.map((o) => `- ${o.name}${o.category ? ` (${o.category})` : ""}: ${o.url}`).join("\n")}` : "") +
        "\n\nUse get_city_service with an id for full details (documents, fees, opening hours, responsible office)." +
        citationsMd(r.citations);
      return { text, data: { query, services: r.hits, online_services: r.online, sources: r.citations } };
    },
  );

  defineTool(
    server,
    "get_city_service",
    {
      title: "Get a City of Munich service article",
      description: "Full text of one official City of Munich service article (requirements, documents, fees, deadlines, responsible office, online form) by id from search_city_services, or by its stadt.muenchen.de URL.",
      input: z.object({ id: z.string().min(1).max(300).describe("Article id (e.g. '1063712') or stadt.muenchen.de/service URL") }),
    },
    async ({ id }) => {
      const r = await getService(id);
      if (!r) throw new Error(`No service article with id/url "${id}". Use search_city_services first.`);
      const a = r.article;
      const body = a.content.length > 14_000 ? `${a.content.slice(0, 14_000)}\n\n[truncated, see ${a.url}]` : a.content;
      return {
        text: `${body}\n\nOfficial page: ${a.url}${a.last_modified ? ` (last modified ${a.last_modified})` : ""}` + citationsMd([r.citation]),
        data: { id: a.id, name: a.name, url: a.url, language: a.language, last_modified: a.last_modified, content: body, sources: [r.citation] },
        summary: false,
      };
    },
  );
}

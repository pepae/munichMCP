import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { districtAt, districtNames } from "../sources/elections.js";
import { loadAssemblies, withCoordinates, type Assembly } from "../sources/civic.js";
import { matchDistrict } from "../sources/stats.js";
import { locate, locationFields } from "./common.js";
import { citationsMd, defineTool } from "./util.js";

const HOW =
  "At a residents' assembly (Bürgerversammlung), residents of the district can raise questions and motions in person (hand them in in writing, " +
  "form at https://www.muenchen.de/buergerversammlung) and vote on them with an official photo ID. Adopted recommendations must then be dealt with by the city council " +
  "or the district committee (Art. 18 Bavarian Municipal Code). The evening often starts with a Q&A hour with city departments.";

const line = (a: Assembly) =>
  `${a.weekday} ${a.date}, ${a.time}: district ${a.district} ${a.district_name}${a.district_part ? ` (${a.district_part})` : ""}, ${a.venue}, ${a.street}${a.info ? ` (${a.info})` : ""}`;

export function registerCivicTools(server: McpServer) {
  defineTool(
    server,
    "citizens_assemblies",
    {
      title: "Residents' assemblies (Bürgerversammlungen): dates and venues",
      description:
        "When and where is the residents' assembly (Bürgerversammlung) for a Munich district or address, where residents can question the city and file motions? " +
        "Official 2026 schedule from the open data portal, with venues on a map. Without a district or address, lists the upcoming assemblies city-wide.",
      input: z.object({
        ...locationFields,
        district: z.string().max(80).optional().describe("District number (1-25) or name, e.g. 'Moosach'"),
        include_past: z.boolean().default(false).describe("Also list assemblies that already took place this year"),
      }),
      ui: true,
      invoking: "Checking the assembly calendar…",
    },
    async (a) => {
      const { items, citation } = await loadAssemblies();
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
      const names = await districtNames().catch(() => ({}) as Record<string, string>);
      let code: string | undefined;
      let label: string | undefined;
      if (a.address || (a.lat !== undefined && a.lon !== undefined)) {
        const loc = await locate(a);
        label = loc.label;
        code = (await districtAt(loc))?.code;
        if (!code) throw new Error(`${loc.label} is not inside a Munich district.`);
      } else if (a.district) {
        code = matchDistrict(a.district, Object.entries(names).map(([c, n]) => ({ code: c, name: n })));
        if (!code) throw new Error(`Unknown district "${a.district}".`);
      }

      const pool = code ? items.filter((x) => x.district === code) : items;
      const upcoming = pool.filter((x) => x.date >= today);
      const shown = await Promise.all((a.include_past || (code && !upcoming.length) ? pool : upcoming).slice(0, code ? 10 : 15).map(withCoordinates));
      const L: string[] = [];
      if (code) {
        const dn = names[code] ?? pool[0]?.district_name ?? code;
        L.push(`Residents' assemblies ${items[0]?.date.slice(0, 4) ?? ""} for district ${code} ${dn}${label ? ` (${label})` : ""}:`);
        if (!pool.length) L.push("No assembly for this district in the published schedule.");
        else if (!upcoming.length) L.push("All assemblies for this district this year have already taken place:");
        else L.push(`Next: ${line(upcoming[0])}`, "");
        const rest = shown.filter((x) => !(upcoming[0] && x.date === upcoming[0].date && x.street === upcoming[0].street));
        if (rest.length && upcoming.length) L.push("Other dates this year:");
        L.push(...rest.map((x) => `- ${line(x)}${x.date < today ? " (past)" : ""}`));
      } else {
        L.push(`Upcoming residents' assemblies in Munich (from ${today}):`, ...shown.map((x) => `- ${line(x)}`));
        if (!upcoming.length) L.push("None left in the published schedule for this year; the next year's dates are usually published in January.");
      }
      L.push("", HOW, "Background: wiki page topics/buergerversammlungen.");
      const next = upcoming[0];
      return {
        text: L.join("\n") + citationsMd([citation]),
        data: { district: code ? { code, name: names[code] } : undefined, today, next, assemblies: shown, how_it_works: HOW, sources: [citation] },
        view: {
          kind: "map",
          title: code ? `Bürgerversammlung: ${names[code] ?? code}` : "Upcoming Bürgerversammlungen",
          subtitle: next ? `Next: ${next.weekday} ${next.date}, ${next.time}, ${next.venue}` : "No upcoming assembly in the published schedule",
          center: shown.find((x) => x.lat) ?? { lat: 48.1374, lon: 11.5755 },
          zoom: code ? 14 : 11,
          cards: next ? [{ title: "Next assembly", lines: [`${next.weekday} ${next.date}`, `${next.time}, ${next.venue}`] }] : [],
          markers: shown
            .filter((x) => x.lat !== undefined)
            .map((x) => ({ lat: x.lat!, lon: x.lon!, label: `${x.date} ${x.time}: ${x.venue}`, sublabel: `District ${x.district} ${x.district_name} · ${x.street}`, color: x.date < today ? "#868e96" : "#1864ab" })),
          attribution: "Landeshauptstadt München, Direktorium (dl-de/by-2.0)",
        },
      };
    },
  );
}

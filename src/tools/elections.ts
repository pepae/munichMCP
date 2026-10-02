import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fold } from "../lib/text.js";
import { districtAt, districtNames, electionCitation, loadElection, precinctAt, type AreaResult } from "../sources/elections.js";
import { locate } from "./common.js";
import { citationsMd, defineTool } from "./util.js";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${n.toFixed(1)} %`);
const pp = (d: number) => (Math.abs(d) < 0.05 ? "±0.0 pp" : `${d > 0 ? "+" : ""}${d.toFixed(1)} pp`);

function top(r: AreaResult, n = 6) {
  return r.parties.filter((p) => p.pct !== null).slice(0, n);
}

function line(r: AreaResult, city?: AreaResult, n = 6) {
  return top(r, n)
    .map((p) => {
      const c = city?.parties.find((x) => x.party === p.party)?.pct;
      return `${p.party} ${pct(p.pct)}${city && c !== null && c !== undefined && p.pct !== null ? ` (${pp(p.pct - c)} vs city)` : ""}`;
    })
    .join(", ");
}

export function registerElectionTools(server: McpServer) {
  defineTool(
    server,
    "election_results",
    {
      title: "Munich election results by district and precinct",
      description:
        "Official results of recent elections in Munich (city election office, open data): the 2026 city council election (Stadtratswahl), the 2026 mayoral election first round, " +
        "and the 2025 federal election (second votes, plus first votes per constituency). Ask for the whole city, one district (number or name), an address " +
        "(gives its district, its polling precinct and, for the federal election, its constituency), or one party's result in every district " +
        "('where are the Greens strongest?'). Shows turnout and the difference to the city result.",
      input: z.object({
        election: z.enum(["stadtrat_2026", "ob_2026", "bundestag_2025"]).default("stadtrat_2026"),
        address: z.string().max(200).optional().describe("An address: returns its district, polling precinct and constituency results"),
        district: z.string().max(80).optional().describe("District number (1-25) or name, e.g. 'Au-Haidhausen'"),
        party: z.string().max(60).optional().describe("Show this party's share in all 25 districts, e.g. 'GRÜNE', 'CSU', 'SPD', 'AfD', 'Volt'"),
      }),
      ui: true,
      invoking: "Counting the votes…",
    },
    async (a) => {
      const e = await loadElection(a.election);
      const names = await districtNames();
      const citation = electionCitation(e.fetchedAt);
      const head = `${e.def.label}, ${e.def.date}. City of Munich: turnout ${pct(e.city.turnout_pct)} (${(e.city.voters ?? 0).toLocaleString("en")} of ${(e.city.eligible ?? 0).toLocaleString("en")} eligible).`;

      // 1) One party across all districts
      if (a.party) {
        const want = fold(a.party).replace(/[^a-z0-9]/g, "");
        const match = e.city.parties.find((p) => fold(p.party).replace(/[^a-z0-9]/g, "") === want) ?? e.city.parties.find((p) => fold(p.party).replace(/[^a-z0-9]/g, "").includes(want));
        if (!match) throw new Error(`No party "${a.party}" in this election. Parties: ${e.city.parties.map((p) => p.party).join(", ")}`);
        const rows = [...e.districts.values()]
          .map((d) => ({ code: d.code, name: names[d.code] ?? d.code, pct: d.parties.find((p) => p.party === match.party)?.pct ?? null }))
          .sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1));
        return {
          text:
            `${head}\n${match.party}: ${pct(match.pct)} city-wide.\n\nBy district (all votes incl. postal):\n` +
            rows.map((r, i) => `${i + 1}. ${r.code} ${r.name}: ${pct(r.pct)}`).join("\n") +
            `\n\nNote: ${e.def.notes}` +
            citationsMd([citation]),
          data: { election: e.def, party: match.party, city_pct: match.pct, districts: rows, sources: [citation] },
          view: {
            kind: "bars",
            title: `${match.party}: ${e.def.label}`,
            subtitle: `City-wide ${pct(match.pct)} · share by district`,
            unit: "%",
            rows: rows.map((r) => ({ label: `${r.code} ${r.name}`, value: r.pct ?? 0, display: pct(r.pct), highlight: false })),
            attribution: "Wahlamt der Landeshauptstadt München (dl-de/by-2.0)",
          },
        };
      }

      // 2) An address or district
      let code: string | undefined;
      let precinctInfo: { precinct: string; result?: AreaResult } | undefined;
      let constituency: { id: string; result?: AreaResult } | undefined;
      let label: string | undefined;
      if (a.address) {
        const loc = await locate({ address: a.address });
        label = loc.label;
        code = (await districtAt(loc))?.code;
        const pr = await precinctAt(e.def, loc).catch(() => undefined);
        if (pr) precinctInfo = { precinct: pr.precinct, result: e.precincts.get(pr.precinct) };
        const wk = e.def.constituencyShapes ? await precinctAt(e.def, loc, "constituencyShapes").catch(() => undefined) : undefined;
        if (wk) constituency = { id: wk.precinct, result: e.constituencies.get(wk.precinct) };
      } else if (a.district) {
        const t = a.district.trim();
        code = /^\d{1,2}$/.test(t)
          ? t.padStart(2, "0")
          : Object.entries(names).find(([, n]) => fold(n).replace(/[^a-z]/g, "").includes(fold(t).replace(/[^a-z]/g, "")))?.[0];
        if (!code) throw new Error(`Unknown district "${a.district}"`);
      }

      if (code) {
        const d = e.districts.get(code);
        if (!d) throw new Error(`No district result for ${code}`);
        const lines = [
          head,
          "",
          `District ${code} ${names[code] ?? ""}${label ? ` (for ${label})` : ""}: turnout ${pct(d.turnout_pct)}. ${line(d, e.city)}.`,
        ];
        if (precinctInfo?.result) {
          lines.push(
            `Polling precinct ${precinctInfo.precinct} (in-person votes only, ${precinctInfo.result.voters ?? "?"} voters; postal votes are counted separately and are not included): ${line(precinctInfo.result, undefined, 5)}.`,
          );
        }
        if (constituency?.result) {
          const w = top(constituency.result, 3);
          lines.push(`Constituency (Wahlkreis) ${constituency.id}, first votes: ${w.map((p) => `${p.party} ${pct(p.pct)}`).join(", ")}.`);
        }
        lines.push(`City-wide: ${line(e.city)}.`, "", `Note: ${e.def.notes}`);
        const winner = top(d, 1)[0];
        return {
          text: lines.join("\n") + citationsMd([citation]),
          data: {
            election: e.def,
            district: { ...d, code, name: names[code] },
            precinct: precinctInfo ? { number: precinctInfo.precinct, in_person_only: true, ...precinctInfo.result } : undefined,
            constituency: constituency ? { id: constituency.id, first_votes: constituency.result } : undefined,
            city: e.city,
            sources: [citation],
          },
          view: {
            kind: "bars",
            title: `${names[code] ?? code}: ${e.def.label}`,
            subtitle: `Turnout ${pct(d.turnout_pct)} · strongest: ${winner?.party} ${pct(winner?.pct)} · city in brackets`,
            unit: "%",
            rows: top(d, 10).map((p) => {
              const c = e.city.parties.find((x) => x.party === p.party)?.pct;
              return { label: p.party, value: p.pct ?? 0, display: `${pct(p.pct)}${c !== null && c !== undefined ? ` (${pct(c)})` : ""}`, highlight: p === winner };
            }),
            note: precinctInfo?.result ? `Polling precinct ${precinctInfo.precinct} (in-person only): ${line(precinctInfo.result, undefined, 4)}` : undefined,
            attribution: "Wahlamt der Landeshauptstadt München (dl-de/by-2.0)",
          },
        };
      }

      // 3) City-wide overview with the strongest party per district
      const byDistrict = [...e.districts.values()].map((d) => ({ code: d.code, name: names[d.code] ?? d.code, winner: top(d, 1)[0], turnout: d.turnout_pct }));
      return {
        text:
          `${head}\n\nCity-wide (all votes incl. postal): ${line(e.city, undefined, 12)}.\n\nStrongest party by district:\n` +
          byDistrict.map((d) => `- ${d.code} ${d.name}: ${d.winner?.party} ${pct(d.winner?.pct)} (turnout ${pct(d.turnout)})`).join("\n") +
          `\n\nNote: ${e.def.notes}` +
          citationsMd([citation]),
        data: { election: e.def, city: e.city, districts: byDistrict, sources: [citation] },
        view: {
          kind: "bars",
          title: `${e.def.label}: Munich`,
          subtitle: `Turnout ${pct(e.city.turnout_pct)}`,
          unit: "%",
          rows: top(e.city, 12).map((p) => ({ label: p.party, value: p.pct ?? 0, display: pct(p.pct) })),
          attribution: "Wahlamt der Landeshauptstadt München (dl-de/by-2.0)",
        },
      };
    },
  );

}

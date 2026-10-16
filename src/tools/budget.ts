import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { budgetCitation, loadBudget, matchDepartment, matchProducts, populationByYear, type BudgetRow } from "../sources/budget.js";
import { cite } from "../lib/sources.js";
import { citationsMd, defineTool } from "./util.js";

const eurM = (n: number) => `${n < 0 ? "-" : ""}€${(Math.abs(n) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
const eurBn = (n: number) => `${n < 0 ? "-" : ""}€${(Math.abs(n) / 1e9).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bn`;
const eur = (n: number) => `€${Math.round(n).toLocaleString("en")}`;
const money = (n: number) => (Math.abs(n) >= 1e9 ? eurBn(n) : eurM(n));
const pctChange = (a: number, b: number) => (a ? `${b >= a ? "+" : ""}${(((b - a) / Math.abs(a)) * 100).toFixed(0)} %` : "n/a");

const NOTE =
  "Ordinary income and expenses (Ergebnishaushalt, accrual accounting) of the city's core budget per product, actual results as of 31 Dec. " +
  "Investments count only through depreciation; city-owned companies such as Stadtwerke München keep their own accounts (only city payments to them appear here).";

function sum(rows: BudgetRow[]) {
  return rows.reduce((a, r) => ({ income: a.income + r.income, expense: a.expense + r.expense }), { income: 0, expense: 0 });
}

export function registerBudgetTools(server: McpServer) {
  defineTool(
    server,
    "city_budget",
    {
      title: "City of Munich budget: income and expenses by service",
      description:
        "What does the City of Munich spend on what? Official budget results (Stadtkämmerei, open data) for about 200 city products, from fire protection, childcare and schools to " +
        "libraries, roads and social benefits: ordinary expenses, income, net cost, cost per resident and the trend since 2018, by department (Referat) or for the whole city. " +
        "Search in German or English, e.g. 'Brandschutz', 'fire brigade', 'Kita', 'libraries', 'Oktoberfest'.",
      input: z.object({
        query: z.string().max(120).optional().describe("Service or topic, e.g. 'Brandschutz', 'childcare', 'Stadtbibliothek', 'Friedhöfe'"),
        department: z.string().max(80).optional().describe("Department (Referat), e.g. 'Sozialreferat', 'Kulturreferat', 'RBS', 'KVR'"),
        year: z.number().int().min(2018).max(2030).optional().describe("Budget year (default: latest available)"),
      }),
      ui: true,
      invoking: "Opening the city's books…",
    },
    async (a) => {
      const [{ rows, years, fetchedAt }, pop] = await Promise.all([loadBudget(), populationByYear().catch(() => new Map<number, number>())]);
      const year = a.year && years.includes(a.year) ? a.year : years.at(-1)!;
      const first = years[0];
      const inYear = rows.filter((r) => r.year === year);
      const residents = pop.get(year);
      const perRes = (n: number) => (residents ? ` (${eur(n / residents)} per resident)` : "");
      const citations = [budgetCitation(fetchedAt), residents ? { ...cite("stats", fetchedAt), url: "https://opendata.muenchen.de/dataset/monatszahlen-bevoelkerung" } : undefined];
      const head = `City of Munich budget ${year}${residents ? `, ${residents.toLocaleString("en")} residents at year end` : ""}.`;

      // 1) Products matching a topic
      if (a.query) {
        const names = matchProducts(a.department ? rows.filter((r) => r.department === matchDepartment(rows, a.department!)) : rows, a.query);
        if (!names.length) {
          const deps = [...new Set(inYear.map((r) => r.department))];
          throw new Error(`No budget product matches "${a.query}". Try a German term (e.g. 'Brandschutz', 'Tageseinrichtungen', 'Bibliothek') or a department: ${deps.join(", ")}`);
        }
        const items = names
          .map((name) => {
            const series = rows.filter((r) => r.product === name).sort((x, y) => x.year - y.year);
            const cur = series.find((r) => r.year === year);
            const base = series.find((r) => r.year === first);
            return { name, department: series[0].department, cur, base, series };
          })
          .filter((i) => i.cur)
          .sort((x, y) => y.cur!.expense - x.cur!.expense)
          .slice(0, 12);
        const lines = items.map((i) => {
          const c = i.cur!;
          const net = c.expense - c.income;
          return (
            `- ${i.name} (${i.department}): expenses ${money(c.expense)}, income ${money(c.income)}, net cost ${money(net)}${perRes(net)}` +
            `${c.expense ? `, ${Math.round((c.income / c.expense) * 100)} % cost coverage` : ""}${i.base ? `; expenses ${pctChange(i.base.expense, c.expense)} since ${first}` : ""}`
          );
        });
        const single = items.length === 1 ? items[0] : undefined;
        const trend = single ? `\n\nTrend (expenses / income):\n${single.series.map((r) => `- ${r.year}: ${money(r.expense)} / ${money(r.income)}`).join("\n")}` : "";
        return {
          text: `${head}\nProducts matching "${a.query}":\n${lines.join("\n")}${trend}\n\nNote: ${NOTE}` + citationsMd(citations),
          data: {
            year,
            residents,
            products: items.map((i) => ({ product: i.name, department: i.department, expense_eur: i.cur!.expense, income_eur: i.cur!.income, net_cost_eur: i.cur!.expense - i.cur!.income, net_cost_per_resident_eur: residents ? Math.round((i.cur!.expense - i.cur!.income) / residents) : undefined, series: i.series.map((r) => ({ year: r.year, expense_eur: r.expense, income_eur: r.income })) })),
            note: NOTE,
            sources: citations.filter(Boolean),
          },
          view: single
            ? {
                kind: "bars",
                title: single.name,
                subtitle: `${single.department}: expenses per year (income in brackets)`,
                unit: "€",
                rows: single.series.map((r) => ({ label: String(r.year), value: r.expense, display: `${money(r.expense)} (${money(r.income)})`, highlight: r.year === year })),
                attribution: "Landeshauptstadt München, Stadtkämmerei (dl-de/by-2.0)",
              }
            : {
                kind: "bars",
                title: `Budget ${year}: "${a.query}"`,
                subtitle: "Net cost per product (expenses minus income)",
                unit: "€",
                rows: items.map((i) => ({ label: i.name, value: Math.max(0, i.cur!.expense - i.cur!.income), display: money(i.cur!.expense - i.cur!.income) })),
                attribution: "Landeshauptstadt München, Stadtkämmerei (dl-de/by-2.0)",
              },
        };
      }

      // 2) One department
      if (a.department) {
        const dep = matchDepartment(rows, a.department);
        if (!dep) throw new Error(`Unknown department "${a.department}". Departments: ${[...new Set(inYear.map((r) => r.department))].join(", ")}`);
        const prods = inYear.filter((r) => r.department === dep).sort((x, y) => y.expense - x.expense);
        const tot = sum(prods);
        const trend = years.map((y) => ({ year: y, ...sum(rows.filter((r) => r.year === y && r.department === dep)) }));
        return {
          text:
            `${head}\n${dep}: expenses ${money(tot.expense)}, income ${money(tot.income)}, net ${money(tot.expense - tot.income)}${perRes(tot.expense - tot.income)}; ${prods.length} products.\n\n` +
            `Products by expenses:\n${prods.map((p) => `- ${p.product}: ${money(p.expense)} (income ${money(p.income)})`).join("\n")}\n\n` +
            `Department expenses by year: ${trend.map((t) => `${t.year} ${money(t.expense)}`).join(", ")} (${pctChange(trend[0].expense, trend.at(-1)!.expense)} since ${first}).\n\nNote: ${NOTE}` +
            citationsMd(citations),
          data: { year, department: dep, totals: { expense_eur: tot.expense, income_eur: tot.income }, products: prods.map((p) => ({ product: p.product, expense_eur: p.expense, income_eur: p.income })), trend, residents, note: NOTE, sources: citations.filter(Boolean) },
          view: {
            kind: "bars",
            title: `${dep} ${year}`,
            subtitle: `Expenses ${money(tot.expense)}, income ${money(tot.income)}`,
            unit: "€",
            rows: prods.slice(0, 20).map((p) => ({ label: p.product, value: p.expense, display: money(p.expense) })),
            attribution: "Landeshauptstadt München, Stadtkämmerei (dl-de/by-2.0)",
          },
        };
      }

      // 3) Whole city
      const tot = sum(inYear);
      const byDep = [...new Set(inYear.map((r) => r.department))]
        .map((d) => ({ department: d, ...sum(inYear.filter((r) => r.department === d)) }))
        .sort((x, y) => y.expense - x.expense);
      const trend = years.map((y) => ({ year: y, ...sum(rows.filter((r) => r.year === y)) }));
      const topNet = [...inYear].sort((x, y) => y.expense - y.income - (x.expense - x.income)).slice(0, 10);
      return {
        text:
          `${head}\nOrdinary income ${money(tot.income)}, ordinary expenses ${money(tot.expense)}, result ${money(tot.income - tot.expense)} (${tot.income >= tot.expense ? "surplus" : "deficit"}).\n\n` +
          `Expenses by department:\n${byDep.map((d) => `- ${d.department}: ${money(d.expense)}${perRes(d.expense)} (income ${money(d.income)})`).join("\n")}\n\n` +
          `Largest net costs (expenses minus income):\n${topNet.map((p) => `- ${p.product} (${p.department}): ${money(p.expense - p.income)}${perRes(p.expense - p.income)}`).join("\n")}\n\n` +
          `By year (income / expenses): ${trend.map((t) => `${t.year} ${money(t.income)} / ${money(t.expense)}`).join("; ")}.\n\nNote: ${NOTE}` +
          citationsMd(citations),
        data: { year, residents, totals: { income_eur: tot.income, expense_eur: tot.expense, result_eur: tot.income - tot.expense }, by_department: byDep, largest_net_costs: topNet, trend, note: NOTE, sources: citations.filter(Boolean) },
        view: {
          kind: "bars",
          title: `City of Munich budget ${year}`,
          subtitle: `Income ${money(tot.income)}, expenses ${money(tot.expense)}, by department`,
          unit: "€",
          rows: byDep.map((d) => ({ label: d.department, value: d.expense, display: money(d.expense) })),
          attribution: "Landeshauptstadt München, Stadtkämmerei (dl-de/by-2.0)",
        },
      };
    },
  );
}

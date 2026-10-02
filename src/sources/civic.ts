import { DAY, liveCache } from "../lib/cache.js";
import { datasetCsv } from "../lib/ckan.js";
import { geocode } from "../lib/geocode.js";
import { cite, type Citation } from "../lib/sources.js";

/**
 * Dates and venues of the district residents' assemblies (Bürgerversammlungen)
 * from the open data portal (dl-de/by-2.0), one row per assembly.
 */

const DATASET = "termine-buergerversammlungen-muenchen";

export interface Assembly {
  date: string;
  weekday: string;
  time: string;
  district: string;
  district_name: string;
  district_part?: string;
  venue: string;
  street: string;
  postcode_city: string;
  info?: string;
  lat?: number;
  lon?: number;
}

const WEEKDAYS: Record<string, string> = { Montag: "Monday", Dienstag: "Tuesday", Mittwoch: "Wednesday", Donnerstag: "Thursday", Freitag: "Friday", Samstag: "Saturday", Sonntag: "Sunday" };

/** Column lookup that tolerates the fixed-width padding in this CSV's headers and cells. */
const col = (r: Record<string, string>, name: string) => (Object.entries(r).find(([k]) => k.trim() === name)?.[1] ?? "").trim();

export async function loadAssemblies(): Promise<{ items: Assembly[]; fetchedAt: number; citation: Citation }> {
  const { rows, fetchedAt } = await datasetCsv(DATASET, { maxAgeMs: DAY });
  const items = rows
    .map((r) => ({
      date: col(r, "datum"),
      weekday: WEEKDAYS[col(r, "wochentag")] ?? col(r, "wochentag"),
      time: col(r, "uhrzeit").replace(/\s*Uhr$/, ":00").replace(/^(\d):/, "0$1:"),
      district: (/\d+/.exec(col(r, "stadtbezirk_nummer"))?.[0] ?? "").padStart(2, "0"),
      district_name: col(r, "stadtbezirk_name").replace(/AmHart/, "Am Hart"),
      district_part: col(r, "stadtbezirk_teil").replace(/^BT\s+/, "") || undefined,
      venue: col(r, "veranstaltungsort"),
      street: col(r, "strasse"),
      postcode_city: col(r, "ort"),
      info: col(r, "weitere_informationen") || undefined,
    }))
    .filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.district !== "00")
    .sort((a, b) => a.date.localeCompare(b.date));
  return { items, fetchedAt, citation: cite("assemblies", fetchedAt) };
}

/** Coordinates of the venue via the city's address index (cached). */
export async function withCoordinates(a: Assembly): Promise<Assembly> {
  const { value } = await liveCache.get(`venue:${a.street}`, 30 * DAY, async () => {
    const hit = (await geocode(a.street).catch(() => []))[0];
    return hit ? { lat: hit.lat, lon: hit.lon } : null;
  });
  return value ? { ...a, ...value } : a;
}

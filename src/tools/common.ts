import { z } from "zod";
import { resolveLocation, type ResolvedLocation } from "../lib/geocode.js";

/** Shared input fields for tools that take a location. */
export const locationFields = {
  address: z
    .string()
    .max(200)
    .optional()
    .describe("Address or place in Munich, e.g. 'Lindwurmstr. 50', 'Marienplatz 8' or 'Hauptbahnhof'. Either this or lat/lon."),
  lat: z.number().min(47.9).max(48.4).optional().describe("Latitude (WGS84), use together with lon instead of address"),
  lon: z.number().min(11.2).max(11.9).optional().describe("Longitude (WGS84)"),
};

export async function locate(args: { address?: string; lat?: number; lon?: number }): Promise<ResolvedLocation> {
  return resolveLocation(args);
}

export function locationLine(loc: ResolvedLocation): string {
  const w = loc.warning ? `\n> Note: ${loc.warning}` : "";
  return `Location: ${loc.label} (${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}; ${loc.precision}, via ${loc.source === "city-address-index" ? "City of Munich address index" : loc.source})${w}`;
}

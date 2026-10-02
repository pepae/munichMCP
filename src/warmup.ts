import { DAY, HOUR } from "./lib/cache.js";
import { sleep } from "./lib/http.js";
import { getLayer } from "./lib/wfs.js";
import { ADDRESS_LAYERS } from "./sources/address.js";
import { loadBudget, populationByYear } from "./sources/budget.js";
import { loadAssemblies } from "./sources/civic.js";
import { warmElections } from "./sources/elections.js";
import { ISAR_LAYERS } from "./sources/environment.js";
import { loadServices } from "./sources/services.js";
import { MOBILITY_LAYERS } from "./sources/mobility.js";
import { CATEGORIES } from "./sources/places.js";
import { ROADWORKS_LAYER } from "./sources/roadworks.js";

/**
 * Preload datasets at startup, one at a time (gentle on the city's servers),
 * then refresh on a schedule. Everything is also loaded lazily on first use.
 */
export async function warmUp(): Promise<void> {
  const started = Date.now();
  const layers = [...Object.values(ADDRESS_LAYERS), ...MOBILITY_LAYERS, ...Object.values(ISAR_LAYERS), ROADWORKS_LAYER];
  let ok = 0;
  for (const t of layers) {
    try {
      await getLayer(t, t === ROADWORKS_LAYER ? HOUR : DAY);
      ok++;
    } catch (e) {
      console.warn(`[warmup] layer ${t}: ${String(e)}`);
    }
    await sleep(150);
  }
  for (const c of CATEGORIES) {
    try {
      await c.load();
      ok++;
    } catch (e) {
      console.warn(`[warmup] category ${c.id}: ${String(e)}`);
    }
    await sleep(150);
  }
  for (const extra of extraWarmups) {
    try {
      await extra();
      ok++;
    } catch (e) {
      console.warn(`[warmup] ${String(e)}`);
    }
  }
  console.log(`[warmup] ${ok} datasets ready in ${Math.round((Date.now() - started) / 1000)}s`);
}

/** Other modules register their own warm-up loaders here. */
export const extraWarmups: (() => Promise<unknown>)[] = [loadServices, warmElections, loadBudget, populationByYear, loadAssemblies];

export function scheduleRefresh(): void {
  // Roadworks change during the day; everything else daily.
  setInterval(() => getLayer(ROADWORKS_LAYER, HOUR).catch(() => undefined), HOUR).unref();
  setInterval(() => warmUp().catch(() => undefined), DAY).unref();
}

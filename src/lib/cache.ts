import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

interface Entry<T> {
  value: T;
  fetchedAt: number;
}

/**
 * In-memory TTL cache with in-flight de-duplication and stale fallback:
 * if a refresh fails and a previous value exists, the stale value is served.
 */
export class TtlCache {
  private entries = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  async get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<{ value: T; fetchedAt: number; stale: boolean }> {
    const hit = this.entries.get(key) as Entry<T> | undefined;
    if (hit && Date.now() - hit.fetchedAt < ttlMs) return { ...hit, stale: false };
    let p = this.inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = loader();
      this.inflight.set(key, p);
    }
    try {
      const value = await p;
      const entry = { value, fetchedAt: Date.now() };
      this.entries.set(key, entry);
      this.prune();
      return { ...entry, stale: false };
    } catch (err) {
      if (hit) return { ...hit, stale: true };
      throw err;
    } finally {
      this.inflight.delete(key);
    }
  }

  private prune() {
    if (this.entries.size <= 2000) return;
    const oldest = [...this.entries.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt).slice(0, 500);
    for (const [k] of oldest) this.entries.delete(k);
  }
}

export const liveCache = new TtlCache();

/**
 * Disk-backed dataset cache for slow-changing open data (WFS layers, CSVs).
 * Survives restarts, so the server can boot offline from the last good copy.
 */
export async function diskCached<T>(
  name: string,
  maxAgeMs: number,
  fetcher: () => Promise<T>,
): Promise<{ value: T; fetchedAt: number; fromDisk: boolean }> {
  const file = path.join(config.cacheDir, `${name.replace(/[^\w.-]+/g, "_")}.json`);
  let cached: Entry<T> | undefined;
  try {
    cached = JSON.parse(await fs.readFile(file, "utf8")) as Entry<T>;
  } catch {
    cached = undefined;
  }
  if (cached && Date.now() - cached.fetchedAt < maxAgeMs) return { ...cached, fromDisk: true };
  try {
    const value = await fetcher();
    const entry: Entry<T> = { value, fetchedAt: Date.now() };
    await fs.mkdir(config.cacheDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry));
    await fs.rename(tmp, file);
    return { ...entry, fromDisk: false };
  } catch (err) {
    if (cached) {
      console.warn(`[cache] refresh of ${name} failed, serving copy from ${new Date(cached.fetchedAt).toISOString()}: ${String(err)}`);
      return { ...cached, fromDisk: true };
    }
    throw err;
  }
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

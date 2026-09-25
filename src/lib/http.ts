import { config } from "../config.js";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
  }
}

interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number;
  method?: string;
  body?: string;
}

async function doFetch(url: string, opts: FetchOpts): Promise<Response> {
  const { timeoutMs = 20_000, headers = {}, retries = 1, method = "GET", body } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { "User-Agent": config.userAgent, Accept: "*/*", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new HttpError(`HTTP ${res.status}`, res.status, url);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new HttpError(`HTTP ${res.status} for ${url}`, res.status, url);
      return res;
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status < 500) throw err;
      if (attempt < retries) await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await doFetch(url, opts);
  return decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type"));
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await doFetch(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  const text = decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type"));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`Invalid JSON from ${url}: ${text.slice(0, 120)}`, res.status, url);
  }
}

/** Decode as UTF-8, falling back to Windows-1252 for legacy CSV exports. */
export function decodeBody(bytes: Uint8Array, contentType?: string | null): string {
  const declared = /charset=([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase();
  if (declared && declared !== "utf-8" && declared !== "utf8") {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      /* fall through */
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

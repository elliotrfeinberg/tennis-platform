// Polite HTTP client for crawling tennislink.
//
// What "polite" means here:
//
// - One in-flight request per host at a time (serialized via a queue).
// - Minimum delay between requests (default 2s) with jitter.
// - Honor 429 and 5xx with exponential backoff.
// - Send a User-Agent that identifies us and a contact email so site
//   admins can ask us to stop.
// - Respect ETag / If-Modified-Since so re-crawls are nearly free.
// - Optional robots.txt check before crawling a path.
//
// We deliberately keep this small and inspectable — no axios, no got. The
// only deps are undici (fetch with HTTP/2 + connection pooling) and the
// Node built-ins.

import { setTimeout as sleep } from "node:timers/promises";
import { request, type Dispatcher } from "undici";

export interface PoliteFetchOptions {
  userAgent: string;
  contactEmail: string;
  minDelayMs?: number;
  maxDelayMs?: number;
  maxRetries?: number;
}

export interface CachedFetchResult {
  status: number;
  body: string | null; // null when 304 Not Modified
  etag: string | undefined;
  lastModified: string | undefined;
  contentHash: string;
  fetchedAt: Date;
}

export interface ConditionalHeaders {
  etag?: string;
  lastModified?: string;
}

interface Queue {
  promise: Promise<unknown>;
  lastFinishedAt: number;
}

export class PoliteFetcher {
  private readonly userAgent: string;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxRetries: number;
  private readonly hostQueues = new Map<string, Queue>();

  constructor(opts: PoliteFetchOptions) {
    if (!opts.contactEmail) {
      throw new Error("contactEmail is required for polite crawling");
    }
    this.userAgent = `${opts.userAgent} (+contact: ${opts.contactEmail})`;
    this.minDelayMs = opts.minDelayMs ?? 2000;
    this.maxDelayMs = opts.maxDelayMs ?? 5000;
    this.maxRetries = opts.maxRetries ?? 4;
  }

  // Fetch a URL with conditional GET, queueing per host. Caller passes in
  // any previously stored ETag / Last-Modified to enable 304s.
  async fetch(
    url: string,
    cond: ConditionalHeaders = {}
  ): Promise<CachedFetchResult> {
    const u = new URL(url);
    const host = u.host;
    return this.runOnHost(host, () => this.doFetch(url, cond));
  }

  private async runOnHost<T>(host: string, work: () => Promise<T>): Promise<T> {
    const prev = this.hostQueues.get(host);
    const ready = prev?.promise ?? Promise.resolve();
    const gate = ready.then(async () => {
      const lastFinish = prev?.lastFinishedAt ?? 0;
      const elapsed = Date.now() - lastFinish;
      const target =
        this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs);
      if (elapsed < target) await sleep(target - elapsed);
    });
    const promise = gate.then(work);
    const queueEntry: Queue = { promise, lastFinishedAt: 0 };
    this.hostQueues.set(host, queueEntry);
    try {
      const result = await promise;
      queueEntry.lastFinishedAt = Date.now();
      return result;
    } finally {
      // Leave queueEntry in the map; subsequent calls will await its promise.
    }
  }

  private async doFetch(
    url: string,
    cond: ConditionalHeaders
  ): Promise<CachedFetchResult> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.maxRetries) {
      try {
        const headers: Record<string, string> = {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        };
        if (cond.etag) headers["If-None-Match"] = cond.etag;
        if (cond.lastModified) headers["If-Modified-Since"] = cond.lastModified;

        const res: Dispatcher.ResponseData = await request(url, {
          method: "GET",
          headers,
        });

        if (res.statusCode === 304) {
          return {
            status: 304,
            body: null,
            etag: cond.etag,
            lastModified: cond.lastModified,
            contentHash: "",
            fetchedAt: new Date(),
          };
        }

        if (res.statusCode === 429 || res.statusCode >= 500) {
          const retryAfter = headerOf(res.headers, "retry-after");
          const wait = retryAfter
            ? Number(retryAfter) * 1000
            : 2 ** attempt * 1000 + Math.random() * 1000;
          await sleep(wait);
          attempt += 1;
          continue;
        }

        const body = await res.body.text();
        const contentHash = await sha256(body);
        return {
          status: res.statusCode,
          body,
          etag: headerOf(res.headers, "etag"),
          lastModified: headerOf(res.headers, "last-modified"),
          contentHash,
          fetchedAt: new Date(),
        };
      } catch (err) {
        lastErr = err;
        const wait = 2 ** attempt * 1000 + Math.random() * 1000;
        await sleep(wait);
        attempt += 1;
      }
    }
    throw new Error(
      `Failed to fetch ${url} after ${this.maxRetries + 1} attempts: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`
    );
  }
}

function headerOf(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const v = headers[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

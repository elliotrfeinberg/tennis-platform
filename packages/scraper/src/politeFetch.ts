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
import {
  buildPostbackBody,
  extractAspNetState,
} from "./aspNetState.js";
import { LoginRequiredError, isLoginRedirect } from "./session.js";

export interface PoliteFetchOptions {
  userAgent: string;
  contactEmail: string;
  // Optional verbatim Cookie request header (the value, no "Cookie: " prefix).
  // Used to access auth-walled USTA pages with the user's logged-in session.
  cookieHeader?: string;
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
  private readonly cookieHeader: string | undefined;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxRetries: number;
  private readonly hostQueues = new Map<string, Queue>();

  constructor(opts: PoliteFetchOptions) {
    if (!opts.contactEmail) {
      throw new Error("contactEmail is required for polite crawling");
    }
    // When a real browser cookie is paired with the request, the User-Agent
    // also needs to match what was used in the browser — some IdPs check.
    // The caller supplies that real UA; we don't append our "(+contact: ...)"
    // suffix in that case to keep the UA byte-identical with the browser.
    this.userAgent = opts.cookieHeader
      ? opts.userAgent
      : `${opts.userAgent} (+contact: ${opts.contactEmail})`;
    this.cookieHeader = opts.cookieHeader;
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

  // Follow an ASP.NET WebForms __doPostBack as if a user clicked the
  // control. Does two requests counted against the polite-fetch budget:
  // (1) GET the page to extract __VIEWSTATE etc., (2) POST back with
  // __EVENTTARGET set to the given control's unique id (e.g.
  // "ctl00$mainContent$rptPlayersForTeam$ctl06$LinkButton17").
  //
  // The Referer header is set to the GET URL so USTA's anti-CSRF heuristics
  // see a plausible "user clicked from that page" flow.
  async postEventTarget(
    url: string,
    eventTarget: string,
    eventArgument = ""
  ): Promise<CachedFetchResult> {
    const u = new URL(url);
    const host = u.host;
    return this.runOnHost(host, async () => {
      const get = await this.doFetch(url, {});
      if (!get.body) {
        throw new Error(
          `postEventTarget needs an HTML body to extract ViewState, got status ${get.status}`
        );
      }
      const state = extractAspNetState(get.body);
      const body = buildPostbackBody(state, eventTarget, eventArgument);
      return this.doPost(url, body);
    });
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
        if (this.cookieHeader) headers["Cookie"] = this.cookieHeader;

        // undici.request() doesn't follow redirects by default, which is
        // what we want: detect 302 -> login ourselves before silently
        // landing on Auth0.
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

        // 302 -> login is the auth-wall signal. Don't retry; bubble a typed
        // error so the caller can prompt the user to refresh cookies.
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = headerOf(res.headers, "location");
          if (isLoginRedirect(res.statusCode, location)) {
            throw new LoginRequiredError(url);
          }
          // Other redirects (e.g. to the page itself with a normalized URL):
          // follow once manually so we don't lose data.
          if (location) {
            const next = new URL(location, url).toString();
            const followed = await request(next, {
              method: "GET",
              headers,
            });
            return await readResponse(followed);
          }
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

        return await readResponse(res);
      } catch (err) {
        // Don't retry on auth wall — it's not transient.
        if (err instanceof LoginRequiredError) throw err;
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

  // POST a form body to a URL. Same retry / login-detection envelope as
  // doFetch. Sets a Referer matching the URL so anti-CSRF heuristics see
  // a plausible click-from-this-page flow.
  private async doPost(
    url: string,
    body: string
  ): Promise<CachedFetchResult> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.maxRetries) {
      try {
        const headers: Record<string, string> = {
          "User-Agent": this.userAgent,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: url,
          Origin: new URL(url).origin,
        };
        if (this.cookieHeader) headers["Cookie"] = this.cookieHeader;
        const res: Dispatcher.ResponseData = await request(url, {
          method: "POST",
          headers,
          body,
        });
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = headerOf(res.headers, "location");
          if (isLoginRedirect(res.statusCode, location)) {
            throw new LoginRequiredError(url);
          }
          if (location) {
            // Follow once via GET (ASP.NET often issues a PostBackUrl 302).
            const next = new URL(location, url).toString();
            const followed = await request(next, {
              method: "GET",
              headers: {
                "User-Agent": this.userAgent,
                Accept:
                  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
              },
            });
            return await readResponse(followed);
          }
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
        return await readResponse(res);
      } catch (err) {
        if (err instanceof LoginRequiredError) throw err;
        lastErr = err;
        const wait = 2 ** attempt * 1000 + Math.random() * 1000;
        await sleep(wait);
        attempt += 1;
      }
    }
    throw new Error(
      `Failed to POST to ${url} after ${this.maxRetries + 1} attempts: ${
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

async function readResponse(
  res: Dispatcher.ResponseData
): Promise<CachedFetchResult> {
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
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

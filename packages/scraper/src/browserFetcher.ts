// Headless-Chromium fetcher for USTA pages that require real JS execution.
//
// PoliteFetcher (undici-based) handles plain GETs and POSTs fine, but
// USTA's __doPostBack links inside ASP.NET UpdatePanels invoke a JS
// `CSRFInitRequestHandler` that rewrites the __EVENTVALIDATION token at
// send time. A static replay of the form body bounces back to a default
// page. We need a real browser context to let that JS run.
//
// Design:
//
// - Same `CrawlFetcher` interface as PoliteFetcher — anything that takes
//   a fetcher can take either. The shared parser pipeline doesn't care
//   how HTML was sourced.
// - Cookies are imported from the existing UstaSession (the same one
//   PoliteFetcher uses). The user's logged-in session is the single
//   source of truth for auth; we don't re-implement login.
// - One browser process, one context, many pages. The context owns the
//   cookie jar. We close pages eagerly to avoid leaks but keep the
//   context (and its cookies) alive for the life of the fetcher.
// - Politeness: same host-queue + min-delay pattern as PoliteFetcher.
//   USTA doesn't care whether the requests came from undici or
//   Chromium — the rate limits apply equally.
//
// The browser is opened lazily on first use. Callers should `await
// fetcher.close()` when done to release the Chromium process.

import { setTimeout as sleep } from "node:timers/promises";
import type { Browser, BrowserContext, Page } from "playwright";
import type { CrawlFetcher } from "./crawlTeam.js";
import type { UstaSession } from "./session.js";

export interface BrowserFetcherOptions {
  session: UstaSession;
  minDelayMs?: number;
  maxDelayMs?: number;
  // If true (default), launch Chromium in headless mode. Pass false when
  // debugging — useful to watch what USTA's JS actually does.
  headless?: boolean;
}

export interface BrowserFetchResult {
  status: number;
  body: string | null;
  // The URL after any client-side or server-side redirects. For postback
  // navigations this is the key signal — opponent par1s show up here.
  finalUrl: string;
}

interface Queue {
  promise: Promise<unknown>;
  lastFinishedAt: number;
}

export class BrowserFetcher implements CrawlFetcher {
  private readonly session: UstaSession;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly headless: boolean;
  private readonly hostQueues = new Map<string, Queue>();

  // Lazy-initialized on first request.
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;

  constructor(opts: BrowserFetcherOptions) {
    this.session = opts.session;
    this.minDelayMs = opts.minDelayMs ?? 3000;
    this.maxDelayMs = opts.maxDelayMs ?? 5000;
    this.headless = opts.headless ?? true;
  }

  // Implements CrawlFetcher: a simple GET via the browser. We use this
  // when something farther down the pipeline (a postback) requires the
  // same logged-in browser context as a prior GET — otherwise plain
  // PoliteFetcher is cheaper and should be preferred.
  async fetch(url: string): Promise<BrowserFetchResult> {
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
        const finalUrl = page.url();
        const body = await page.content();
        return {
          status: resp?.status() ?? 0,
          body,
          finalUrl,
        };
      } finally {
        await page.close();
      }
    });
  }

  // Navigate to `url`, then dispatch a real click on the anchor that
  // corresponds to `eventTarget`. USTA's CSRFInitRequestHandler runs as
  // the page's own JS would; the href="javascript:__doPostBack(...)" is
  // evaluated by Chromium's javascript-URL handler in a non-strict
  // context, so ASP.NET's MS Ajax (which uses arguments.callee.caller)
  // doesn't choke the way it does when we call __doPostBack from a
  // page.evaluate strict-mode frame.
  //
  // eventTarget format: "ctl00$mainContent$rptTeamStandings$ctl06$LinkButton12".
  // The corresponding anchor has id "ctl00_mainContent_..._LinkButton12"
  // ($→_). We accept either form.
  //
  // If the postback does a partial UpdatePanel render (no navigation),
  // finalUrl equals the original url; body still reflects the updated
  // DOM. Caller decides whether that's a failure for their use case.
  async clickPostback(
    url: string,
    eventTarget: string
  ): Promise<BrowserFetchResult> {
    const anchorId = eventTarget.replace(/\$/g, "_");
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
        const startedAt = page.url();
        // Race a navigation against a settle timeout — postbacks that
        // navigate fire 'load'; ones that don't (UpdatePanel partial)
        // never do, and we resolve via the timeout.
        const navPromise = page
          .waitForURL((u) => u.toString() !== startedAt, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          })
          .catch(() => undefined);
        // Wait briefly for the anchor to exist; some ASP.NET pages
        // hydrate the standings table after DOMContentLoaded.
        await page.waitForSelector(`#${cssEscape(anchorId)}`, {
          timeout: 10000,
        });
        await page.click(`#${cssEscape(anchorId)}`);
        await navPromise;
        const finalUrl = page.url();
        const body = await page.content();
        return {
          status: resp?.status() ?? 0,
          body,
          finalUrl,
        };
      } finally {
        await page.close();
      }
    });
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  private async openPage(): Promise<Page> {
    if (!this.context) await this.initContext();
    return this.context!.newPage();
  }

  private async initContext(): Promise<void> {
    // Dynamic import so consumers that never call into Playwright don't
    // pay the startup cost. Also keeps the type-only `import type` at
    // the top from triggering a runtime resolution.
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext({
      userAgent: this.session.userAgent,
    });
    await this.context.addCookies(sessionCookieToPlaywright(this.session));
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
      // Leave queue entry in place; the next call will await its promise.
    }
  }
}

// Escape characters that would otherwise be special in a CSS selector.
// ASP.NET ids never include real CSS-special chars, but defensively
// escape `$` (just in case a caller passes a $-form by mistake) and
// numeric leading chars per the CSS spec.
function cssEscape(s: string): string {
  return s.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

// The shape Playwright's addCookies() accepts — superset of what we set
// here. Defined inline so we don't pull a 'Cookie' type whose required
// fields drift between Playwright versions.
interface CookieParam {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

// Convert a "Cookie: a=1; b=2" header into Playwright's addCookies()
// input. Every cookie targets .usta.com / "/" since that's where the
// user's session lives.
function sessionCookieToPlaywright(session: UstaSession): CookieParam[] {
  const pairs = session.cookieHeader.split(";");
  const out: CookieParam[] = [];
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    out.push({
      name,
      value,
      domain: ".usta.com",
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    });
  }
  return out;
}

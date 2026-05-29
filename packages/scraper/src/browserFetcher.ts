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

  // Submit the "Stats and Standings Advanced Search" team form and
  // return the rendered results page. This is the entry point for
  // enumerating *every* team in a (year, section, division, gender,
  // optional level) tuple — far more efficient than starting from one
  // team par1 and walking standings.
  //
  // The form uses cascading UpdatePanel postbacks: selecting a section
  // triggers an async refresh that populates downstream dropdowns. We
  // page.selectOption between each field and wait for network-idle
  // after section/division to let the cascade settle.
  //
  // Field values are matched by VISIBLE LABEL (not the raw <option>
  // value attribute), because the section dropdown's value is a
  // composite like "6421379,515" that has caused selectOption-by-value
  // to silently no-op. Labels are stable across years.
  //
  //   year:     "2026" (literal year)
  //   section:  e.g. "USTA/NO. CALIFORNIA"
  //   division: e.g. "Adult 18&Over"
  //   gender:   "Male" | "Female" | "Mixed"
  //   level:    e.g. "3.5" | undefined = all levels in division
  async submitTeamSearch(criteria: {
    year: number;
    section: string; // e.g. "USTA/NO. CALIFORNIA"
    division: string; // e.g. "Adult 18&Over"
    gender: "Male" | "Female" | "Mixed";
    level?: string; // omit for all levels in division
    // After the search renders, click the first team row matching this
    // substring (case-insensitive) and harvest the destination URL's
    // par1. The returned result's `extractedPar1` carries the value;
    // `finalUrl` reflects the team-profile page reached.
    extractPar1ForTeamSubstring?: string;
  }): Promise<BrowserFetchResult & { extractedPar1?: string; extractedTeamName?: string }> {
    const url =
      "https://tennislink.usta.com/Leagues/Main/StatsAndStandings.aspx?SearchType=3";
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
        // The search controls live inside a jQuery-UI accordion that's
        // collapsed by default and re-collapses after every AutoPostBack
        // page reload. Idempotent: only click the header when the panel
        // (here proxied by the section dropdown) isn't already visible.
        const expandAccordion = async () => {
          const open = await page
            .locator("#ctl00_mainContent_ddlSection")
            .isVisible()
            .catch(() => false);
          if (!open) {
            await page
              .locator('#accordion h3:has-text("SEARCH FOR TEAMS")')
              .click({ timeout: 10000 })
              .catch(() => undefined);
            await page.waitForTimeout(400);
          }
        };

        // Set a <select> by visible-label text via direct DOM write. We
        // pass a stringified IIFE (not a function arg) to dodge tsx/esbuild's
        // __name() helper injection, which breaks inside page.evaluate.
        const setByLabel = async (id: string, label: string) => {
          const js = `(() => {
            const el = document.getElementById(${JSON.stringify(id)});
            if (!el) return { ok: false, reason: "no element" };
            for (const o of Array.from(el.options)) o.selected = false;
            for (const opt of Array.from(el.options)) {
              if (opt.text.trim() === ${JSON.stringify(label)}) {
                opt.selected = true;
                el.value = opt.value;
                return { ok: true };
              }
            }
            return {
              ok: false,
              reason: "no matching option",
              got: Array.from(el.options).map((o) => o.text.trim()).slice(0, 20),
            };
          })()`;
          return (await page.evaluate(js)) as {
            ok: boolean;
            reason?: string;
            got?: string[];
          };
        };

        // Whether a control fires an ASP.NET AutoPostBack on change (its
        // onchange invokes __doPostBack). Section — and usually year and
        // division — cascade this way to repopulate the dropdowns below.
        const autoPostsBack = async (id: string) => {
          const js = `(() => {
            const el = document.getElementById(${JSON.stringify(id)});
            const oc = (el && el.getAttribute("onchange")) || "";
            return /__doPostBack|WebForm_PostBack|setTimeout/.test(oc);
          })()`;
          return (await page.evaluate(js)) as boolean;
        };

        // Set a criterion and, when it AutoPostBacks, dispatch the change
        // and wait for the full-page postback + downstream re-render.
        //
        // Cascade order is load-bearing: selecting the SECTION posts back
        // and repopulates THAT section's divisions; selecting the DIVISION
        // posts back and repopulates its NTRP levels. The old code set all
        // values without firing these postbacks, so the server's ViewState
        // never loaded NorCal's divisions — our section/division values were
        // invalid and silently dropped, yielding a NATIONAL result set.
        const setCascading = async (id: string, label: string) => {
          await expandAccordion();
          const set = await setByLabel(id, label);
          if (!set.ok) {
            throw new Error(
              `submitTeamSearch: ${id} set failed wanted="${label}" reason="${
                set.reason ?? ""
              }" sample=${JSON.stringify(set.got)}`
            );
          }
          if (await autoPostsBack(id)) {
            const loadP = page
              .waitForEvent("load", { timeout: 30000 })
              .catch(() => undefined);
            await page.evaluate(
              `(() => { const el = document.getElementById(${JSON.stringify(
                id
              )}); if (el) el.dispatchEvent(new Event("change", { bubbles: true })); })()`
            );
            await loadP;
            await page
              .waitForLoadState("networkidle", { timeout: 30000 })
              .catch(() => undefined);
          }
        };

        await setCascading(
          "ctl00_mainContent_ddlChampYear",
          String(criteria.year)
        );
        await setCascading("ctl00_mainContent_ddlSection", criteria.section);
        await setCascading(
          "ctl00_mainContent_ddlDivisionForTeams",
          criteria.division
        );
        await setCascading("ctl00_mainContent_ddlGender", criteria.gender);
        if (criteria.level) {
          await setCascading("ctl00_mainContent_ddlNTRPLevel", criteria.level);
        }
        // Ensure the panel is open so the submit button is clickable.
        await expandAccordion();
        // Click "Find Teams". Despite the name btnSearchTeamByName, it
        // also accepts the criteria dropdowns — submitting with an
        // empty txtTeamName runs a pure criteria search. The other
        // team-section buttons (btnFindStatsAndStandingForTeam,
        // btnClearInputsForTeams) don't drive the criteria search.
        const beforeClick = await page.content();
        await page.click("#ctl00_mainContent_btnSearchTeamByName");
        // The form submit navigates (full reload, not UpdatePanel).
        // Wait for the page to settle and the results table to appear.
        await page
          .waitForLoadState("domcontentloaded", { timeout: 30000 })
          .catch(() => undefined);
        await page
          .waitForLoadState("networkidle", { timeout: 30000 })
          .catch(() => undefined);
        // Look for a results-grid id or fallback to any par1 anchor.
        // Whichever resolves first wins.
        await Promise.race([
          page
            .waitForSelector("table[id*='gvSearchResults'], a[href*='par1=']", {
              timeout: 30000,
            })
            .catch(() => undefined),
          page.waitForTimeout(15000),
        ]);
        const finalUrl = page.url();
        const body = await page.content();
        // Sanity guard: if the body didn't change, the submit didn't go
        // through (USTA sometimes silently rejects malformed criteria).
        if (body === beforeClick) {
          throw new Error(
            "submitTeamSearch: body unchanged after submit — criteria may be invalid"
          );
        }

        // Optional second hop: click a team-row postback to harvest its
        // par1. The results page links each team via __doPostBack; the
        // destination is the team-profile URL which contains par1=…
        // in its share section. We do this on the same page (same JS
        // context, same ViewState) — re-creating from a saved HTML
        // wouldn't work because the postback needs the live state.
        let extractedPar1: string | undefined;
        let extractedTeamName: string | undefined;
        if (criteria.extractPar1ForTeamSubstring) {
          const needle = criteria.extractPar1ForTeamSubstring.toLowerCase();
          // Find the first anchor whose text includes the substring
          // and whose href is a doPostBack into the rptYearTeamsInfo
          // repeater (skip chrome links like paging/sort).
          const found = await page.evaluate(
            `(() => {
              const needle = ${JSON.stringify(needle)};
              const anchors = document.querySelectorAll("a[href*='__doPostBack']");
              for (const a of Array.from(anchors)) {
                const href = a.getAttribute("href") || "";
                if (!/rptYearTeamsInfo/.test(href)) continue;
                const text = (a.textContent || "").trim();
                if (text.toLowerCase().includes(needle)) {
                  return { anchorId: a.id, teamName: text };
                }
              }
              return null;
            })()`
          ) as { anchorId: string; teamName: string } | null;
          if (!found) {
            throw new Error(
              `submitTeamSearch: no team row matched substring "${criteria.extractPar1ForTeamSubstring}"`
            );
          }
          extractedTeamName = found.teamName.replace(/\s+/g, " ");
          // Click the postback anchor and wait for navigation to the
          // team-profile page (same trick as clickPostback).
          const beforeUrl = page.url();
          const navPromise = page
            .waitForURL((u) => u.toString() !== beforeUrl, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            })
            .catch(() => undefined);
          await page.click(`#${cssEscape(found.anchorId)}`);
          await navPromise;
          const destUrl = page.url();
          // par1= can appear in the destination URL as a query param
          // (hex) or in the page body's share-URL block. Try the URL
          // first, fall back to a body grep.
          const urlMatch = destUrl.match(/[?&#]par1=([^&]+)/);
          if (urlMatch) {
            extractedPar1 = decodeURIComponent(urlMatch[1]!);
          } else {
            const destBody = await page.content();
            const bodyMatches = [
              ...destBody.matchAll(/par1=([0-9A-Fa-f]{30,})/g),
            ];
            // Prefer matches inside share URLs (canonical form), which
            // typically include `:443/`. Otherwise take the first match.
            const preferred = bodyMatches.find((m) =>
              m.input!.slice(Math.max(0, m.index! - 100), m.index!).includes(
                ":443"
              )
            );
            extractedPar1 = (preferred ?? bodyMatches[0])?.[1];
          }
        }

        return {
          status: resp?.status() ?? 0,
          body,
          finalUrl,
          extractedPar1,
          extractedTeamName,
        };
      } finally {
        await page.close();
      }
    });
  }

  // Read the visible-text option labels for the team-search dropdowns
  // (year / section / division / gender / NTRP level). Used by the
  // NorCal orchestrator to discover exact labels (e.g. the precise
  // "Adult 18 & Over" spelling and the NorCal section label) instead of
  // hardcoding strings that drift between years. Reads the initial DOM
  // after expanding the accordion — no postback fired, so these are the
  // statically-rendered options.
  async listTeamSearchOptions(): Promise<{
    years: string[];
    sections: string[];
    divisions: string[];
    genders: string[];
    levels: string[];
  }> {
    const url =
      "https://tennislink.usta.com/Leagues/Main/StatsAndStandings.aspx?SearchType=3";
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page
          .locator('#accordion h3:has-text("SEARCH FOR TEAMS")')
          .click({ timeout: 10000 });
        await page.waitForTimeout(400);
        const script = `(() => {
          const read = (id) => {
            const el = document.getElementById(id);
            if (!el) return [];
            return Array.from(el.options)
              .map((o) => o.text.trim())
              .filter((t) => t.length > 0);
          };
          return {
            years: read("ctl00_mainContent_ddlChampYear"),
            sections: read("ctl00_mainContent_ddlSection"),
            divisions: read("ctl00_mainContent_ddlDivisionForTeams"),
            genders: read("ctl00_mainContent_ddlGender"),
            levels: read("ctl00_mainContent_ddlNTRPLevel"),
          };
        })()`;
        return (await page.evaluate(script)) as {
          years: string[];
          sections: string[];
          divisions: string[];
          genders: string[];
          levels: string[];
        };
      } finally {
        await page.close();
      }
    });
  }

  // Discover the rating-search tree node IDs for a (year, section,
  // district) on the public NTRP AdvancedSearch page. These IDs feed
  // ratingSearchResultsUrl. They change per year, so we read them live
  // rather than hardcoding. National + subdistrict are NOT required for a
  // district-wide search (verified), so we only resolve section+district.
  //
  // Mechanism: ddlCYear and ddlSectionNodeID each AutoPostBack. Selecting
  // the year repopulates the section list; selecting the section populates
  // ddlDistrict with that section's districts (option value = node id).
  async discoverRatingSearchScope(opts: {
    year: number;
    sectionLabel: string; // e.g. "USTA/NO. CALIFORNIA"
    districtLabel: string; // e.g. "NO. CALIFORNIA"
  }): Promise<{
    cYear: number;
    sectionNodeId: string;
    districtNodeId: string;
  }> {
    const url =
      "https://tennislink.usta.com/Leagues/Reports/NTRP/AdvancedSearch.aspx";
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });

        const setByLabel = async (id: string, label: string) =>
          (await page.evaluate(
            `(() => { const el=document.getElementById(${JSON.stringify(
              id
            )}); if(!el) return {ok:false,reason:"no element"}; for(const o of Array.from(el.options)) o.selected=false; for(const opt of Array.from(el.options)){ if(opt.text.trim()===${JSON.stringify(
              label
            )}){opt.selected=true; el.value=opt.value; return {ok:true,value:opt.value};}} return {ok:false, got:Array.from(el.options).map(o=>o.text.trim()).slice(0,12)};})()`
          )) as { ok: boolean; value?: string; reason?: string; got?: string[] };
        const fireChange = async (id: string) => {
          const loadP = page
            .waitForEvent("load", { timeout: 30000 })
            .catch(() => undefined);
          await page.evaluate(
            `(() => { const el=document.getElementById(${JSON.stringify(
              id
            )}); if(el) el.dispatchEvent(new Event("change",{bubbles:true})); })()`
          );
          await loadP;
          await page
            .waitForLoadState("networkidle", { timeout: 30000 })
            .catch(() => undefined);
        };

        const yr = await setByLabel(
          "ctl00_mainContent_ddlCYear",
          String(opts.year)
        );
        if (!yr.ok) {
          throw new Error(
            `discoverRatingSearchScope: year ${opts.year} not selectable (got ${JSON.stringify(
              yr.got
            )})`
          );
        }
        await fireChange("ctl00_mainContent_ddlCYear");

        const sec = await setByLabel(
          "ctl00_mainContent_ddlSectionNodeID",
          opts.sectionLabel
        );
        if (!sec.ok || !sec.value) {
          throw new Error(
            `discoverRatingSearchScope: section "${opts.sectionLabel}" not found (got ${JSON.stringify(
              sec.got
            )})`
          );
        }
        await fireChange("ctl00_mainContent_ddlSectionNodeID");

        // After the section postback, ddlDistrict is populated; read the
        // option value matching the district label (no need to select it).
        const districtNodeId = (await page.evaluate(
          `(() => { const el=document.getElementById("ctl00_mainContent_ddlDistrict"); if(!el) return null; for(const opt of Array.from(el.options)){ if(opt.text.trim()===${JSON.stringify(
            opts.districtLabel
          )}) return opt.value; } return null; })()`
        )) as string | null;
        if (!districtNodeId) {
          throw new Error(
            `discoverRatingSearchScope: district "${opts.districtLabel}" not found under "${opts.sectionLabel}" for ${opts.year}`
          );
        }

        // Re-read the section value (the postback may have re-rendered it).
        const sectionNodeId = (await page.evaluate(
          `(() => { const el=document.getElementById("ctl00_mainContent_ddlSectionNodeID"); return el ? el.value : null; })()`
        )) as string | null;
        if (!sectionNodeId) {
          throw new Error(
            "discoverRatingSearchScope: section node id missing after postback"
          );
        }

        return { cYear: opts.year, sectionNodeId, districtNodeId };
      } finally {
        await page.close();
      }
    });
  }

  // Render a flight's "Match Summary" view on the StatsAndStandings t=T-0
  // SPA and return the post-render HTML. The view is selected by a
  // client-side fragment `#&&s=<token>`; on load the page's JS fires an
  // ASP.NET ScriptManager UpdatePanel postback (EVENTARGUMENT "s=<token>")
  // that renders the match table. We just navigate to the fragment URL and
  // wait for the table to appear, then scrape the DOM.
  //
  // par1 is the player/league token from the rating-search row; sToken is
  // the opaque view token captured from the Flights/Match-Summary tab.
  async fetchMatchSummary(
    par1: string,
    sToken: string
  ): Promise<BrowserFetchResult> {
    const base =
      "https://tennislink.usta.com/Leagues/Main/StatsAndStandings.aspx";
    const url = `${base}?t=T-0&par1=${encodeURIComponent(
      par1
    )}&e=1#&&s=${sToken}`;
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
        await page
          .waitForLoadState("networkidle", { timeout: 30000 })
          .catch(() => undefined);
        // The match table renders after the UpdatePanel postback; wait for
        // its header text to show up (bounded — fall through on timeout).
        await page
          .waitForFunction(
            `/Match ID/i.test(document.body ? document.body.innerText : "")`,
            { timeout: 30000 }
          )
          .catch(() => undefined);
        const body = await page.content();
        return { status: resp?.status() ?? 0, body, finalUrl: page.url() };
      } finally {
        await page.close();
      }
    });
  }

  // Fetch a player's t=T-0 "Individual Player Record" page (the landing for a
  // rating-search par1 token). Renders the per-year list of teams the member
  // is on — the discovery surface for flight enumeration. Pair with
  // parsePlayerRecord. par1 is the decoded token, e.g. "25CMH…/2Jdw==".
  async fetchPlayerRecord(par1: string): Promise<BrowserFetchResult> {
    const base =
      "https://tennislink.usta.com/Leagues/Main/StatsAndStandings.aspx";
    const url = `${base}?t=T-0&par1=${encodeURIComponent(par1)}&e=1`;
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
        await page
          .waitForLoadState("networkidle", { timeout: 30000 })
          .catch(() => undefined);
        // The teams table renders the team links (…rptPlayerName…LinkButton4)
        // and/or the "Individual Player Record" header. Wait for either.
        await page
          .waitForFunction(
            `!!document.querySelector("a[id*='rptPlayerName'][id$='LinkButton4']") || /Individual Player Record/i.test(document.body ? document.body.innerText : "")`,
            { timeout: 30000 }
          )
          .catch(() => undefined);
        const body = await page.content();
        return { status: resp?.status() ?? 0, body, finalUrl: page.url() };
      } finally {
        await page.close();
      }
    });
  }

  // Drive the flight-level Match Summary for the flight a given team belongs
  // to. Starting from the player record page, this clicks the team anchor
  // (→ team/subflight context), then the Flight tab (→ flight context, all
  // sub-flights), then the flight-level "Match Summary" tab (→ every match in
  // the flight, with dates). Returns the Match Summary HTML for
  // parseMatchSummary, plus the league/flight labels read from the flight
  // context.
  //
  // We must drive real clicks: calling __doPostBack from page.evaluate trips
  // MS-Ajax's strict-mode `arguments.callee` access. The view is a partial
  // UpdatePanel render (no navigation); the URL only gains a #&&s=<token>
  // fragment, which we ignore.
  async fetchFlightMatchSummary(
    par1: string,
    teamAnchorId: string
  ): Promise<BrowserFetchResult & { leagueLabel?: string; flightLabel?: string }> {
    const base =
      "https://tennislink.usta.com/Leagues/Main/StatsAndStandings.aspx";
    const url = `${base}?t=T-0&par1=${encodeURIComponent(par1)}&e=1`;
    const FLIGHT_TAB = "ctl00_mainContent_lnkFlightForTeams";
    const FLIGHT_MATCH_SUMMARY = "ctl00_mainContent_lnkMatchSummaryForFlight";
    const LEAGUE_ANCHOR = "ctl00_mainContent_lnkLeagueForFlightAnchor";
    return this.runOnHost(new URL(url).host, async () => {
      const page = await this.openPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
        await page
          .waitForLoadState("networkidle", { timeout: 30000 })
          .catch(() => undefined);

        // 1) Click the player's team → team/subflight context.
        await page.waitForSelector(`#${cssEscape(teamAnchorId)}`, {
          timeout: 30000,
        });
        await page.click(`#${cssEscape(teamAnchorId)}`);
        // The Flight tab appears once the team context renders.
        await page.waitForSelector(`#${FLIGHT_TAB}`, { timeout: 30000 });

        // 2) Click the Flight tab → flight-wide context (all sub-flights).
        await page.click(`#${FLIGHT_TAB}`);
        await page.waitForSelector(`#${FLIGHT_MATCH_SUMMARY}`, {
          timeout: 30000,
        });

        // Capture the labels while in flight context.
        const leagueLabel = (
          await page
            .locator(`#${LEAGUE_ANCHOR}`)
            .textContent()
            .catch(() => null)
        )
          ?.replace(/\s+/g, " ")
          .trim();
        const flightLabel = (
          await page
            .locator(`#${FLIGHT_TAB}`)
            .textContent()
            .catch(() => null)
        )
          ?.replace(/\s+/g, " ")
          .trim();

        // 3) Click the flight-level Match Summary tab → every flight match.
        await page.click(`#${FLIGHT_MATCH_SUMMARY}`);
        await page
          .waitForFunction(
            `/Match ID/i.test(document.body ? document.body.innerText : "") && !!document.querySelector("#tblMatchSummarySearch, [id*='MatchSummarySearch']")`,
            { timeout: 30000 }
          )
          .catch(() => undefined);
        const body = await page.content();
        return {
          status: resp?.status() ?? 0,
          body,
          finalUrl: page.url(),
          leagueLabel: leagueLabel || undefined,
          flightLabel: flightLabel || undefined,
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

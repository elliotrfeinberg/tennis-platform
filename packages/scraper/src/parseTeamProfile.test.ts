import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTeamProfile } from "./parseTeamProfile.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(
  join(here, "__fixtures__", "team-profile.html"),
  "utf8"
);
// Captured from a Playwright-rendered DOM (after USTA's JS injects two
// extra GamesWin cells into each standings row, taking the row from 12
// to 14 cells). The parser must handle both layouts.
const BROWSER_FIXTURE = readFileSync(
  join(here, "__fixtures__", "team-profile-browser.html"),
  "utf8"
);
// Captured AFTER a Playwright clickPostback against a standings team
// link, landing on the opponent's team profile. The referrer (our team's
// URL with our par1) appears as the FIRST par1=... in the HTML, but the
// canonical share URLs (Facebook/Twitter buttons) have explicit :443
// port and carry the opponent's par1. The parser must prefer the
// canonical match so we get the rendered team's par1, not the referrer.
const POSTBACK_DEST_FIXTURE = readFileSync(
  join(here, "__fixtures__", "team-profile-postback-dest.html"),
  "utf8"
);

describe("parseTeamProfile (against captured 2026 NorCal 18+W3.5 fixture)", () => {
  const parsed = parseTeamProfile(FIXTURE);

  it("reads the team header", () => {
    const h = parsed.header;
    expect(h.teamName).toBe(
      "WALNUT CREEK RC/Walnut Creek TC 18AW3.5A"
    );
    expect(h.section).toBe("USTA/NO. CALIFORNIA");
    expect(h.district).toBe("NO. CALIFORNIA");
    expect(h.league).toContain("2026 ADULT 18");
    expect(h.flight).toBe("Women's 3.5");
    expect(h.subFlight).toContain("Women's 3.5 - DN - 1");
    expect(h.captain).toBe("Lisa Italia");
    expect(h.year).toBe(2026);
    expect(h.leagueDates).toContain("04/06/2026");
    expect(h.shareUrl).toMatch(
      /StatsAndStandings\.aspx\?t=3&par1=[A-F0-9]+&par2=2026&par3=0/
    );
  });

  it("reads the 7 flight standings rows", () => {
    expect(parsed.standings).toHaveLength(7);
    const home = parsed.standings.find(
      (s) => s.teamName === "WALNUT CREEK RC/Walnut Creek TC 18AW3.5A"
    );
    expect(home).toBeDefined();
    expect(home!.wins).toBe(7);
    expect(home!.matchesPlayed).toBe(7);
    expect(home!.losses).toBe(0);
    expect(home!.gamesWonPct).toBeCloseTo(60.53, 2);
  });

  it("reads all 10 scheduled matches with extractable match IDs", () => {
    expect(parsed.schedule).toHaveLength(10);
    const matchIds = parsed.schedule
      .map((s) => s.matchId)
      .filter((id): id is string => !!id);
    expect(matchIds).toEqual([
      "1011875447",
      "1011875481",
      "1011875443",
      "1011875478",
      "1011875450",
      "1011875461",
      "1011875471",
      "1011875475",
      "1011875466",
      "1011875453",
    ]);
  });

  it("reads played vs upcoming matches correctly", () => {
    const played = parsed.schedule.filter((m) => m.played);
    const upcoming = parsed.schedule.filter((m) => !m.played);
    expect(played.length).toBeGreaterThan(0);
    expect(upcoming.length).toBeGreaterThan(0);
    // Played matches have a "Won X-Y" or "Lost X-Y" result.
    for (const p of played) {
      expect(p.result).toMatch(/^(Won|Lost) \d+-\d+/);
    }
  });

  it("captures opponent names + dates for the first match", () => {
    const m0 = parsed.schedule[0]!;
    expect(m0.date).toBe("4/12/2026");
    expect(m0.opponentName).toBe(
      "WALNUT CREEK RC/Walnut Creek TC 18AW3.5C"
    );
    expect(m0.result).toContain("Won 4-1");
    expect(m0.confirmation).toContain("Confirmed by");
  });

  it("reads the 24-player roster", () => {
    expect(parsed.roster).toHaveLength(24);
    const names = parsed.roster.map((p) => p.name);
    expect(names).toContain("Lisa Italia");
    expect(names).toContain("Isabella Feinberg");
    const britney = parsed.roster.find((p) => p.name === "Britney Aguilar");
    expect(britney?.ntrp).toBe(3);
    const stella = parsed.roster.find((p) => p.name === "Stella So");
    expect(stella?.ntrp).toBe(3.5);
  });
});

describe("parseTeamProfile (browser-rendered DOM, 14-cell standings rows)", () => {
  const parsed = parseTeamProfile(BROWSER_FIXTURE);

  it("still extracts all 7 standings rows despite JS-injected cells", () => {
    expect(parsed.standings).toHaveLength(7);
    const names = parsed.standings.map((s) => s.teamName);
    expect(names).toContain("WALNUT CREEK RC/Walnut Creek TC 18AW3.5A");
    expect(names).toContain("ROUND HILL CC 18AW3.5B");
  });

  it("captures the linkButtonId on every standings row", () => {
    for (const row of parsed.standings) {
      expect(row.linkButtonId).toMatch(
        /^ctl00_mainContent_rptTeamStandings_ctl\d+_LinkButton12$/
      );
    }
  });

  it("reads gamesWonPct from the trailing percent cell, not a fixed index", () => {
    // From the browser HTML: WC 3.5A has 60.81% — index 13 in a 14-cell
    // row, NOT index 11. A fixed-index parser would silently get 0.
    const home = parsed.standings.find(
      (s) => s.teamName === "WALNUT CREEK RC/Walnut Creek TC 18AW3.5A"
    );
    expect(home).toBeDefined();
    expect(home!.gamesWonPct).toBeCloseTo(60.81, 2);
  });
});

describe("parseTeamProfile (clickPostback destination — ROUND HILL CC 18AW3.5B)", () => {
  const parsed = parseTeamProfile(POSTBACK_DEST_FIXTURE);

  it("extracts the rendered team's par1 from the canonical (:443) share URL", () => {
    // The referrer URL appears first in the HTML and points at WC 3.5A's
    // par1 (DB00A152...). The canonical share URLs use :443 and carry
    // ROUND HILL's par1 (DB005F89...). The parser must pick ROUND HILL's
    // — picking the first par1 would silently route every "opponent"
    // crawl back to our own team.
    expect(parsed.header.teamName).toBe("ROUND HILL CC 18AW3.5B");
    expect(parsed.header.shareUrl).toBeDefined();
    expect(parsed.header.shareUrl).toContain(":443");
    expect(parsed.header.shareUrl).toMatch(
      /par1=DB005F89EB90543A63ED9E3A59C80F3E5D4CE3B2D1/
    );
  });
});

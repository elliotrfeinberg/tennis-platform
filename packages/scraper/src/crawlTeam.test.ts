import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { crawlTeam, type CrawlFetcher } from "./crawlTeam.js";

const here = dirname(fileURLToPath(import.meta.url));
const TEAM_PROFILE = readFileSync(
  join(here, "__fixtures__", "team-profile.html"),
  "utf8"
);
const SCORECARD = readFileSync(
  join(here, "__fixtures__", "scorecard.html"),
  "utf8"
);

// Build a stub fetcher that maps URL substrings → fixture body.
function stubFetcher(routes: Array<[RegExp, string]>): CrawlFetcher {
  return {
    async fetch(url: string) {
      for (const [re, body] of routes) {
        if (re.test(url)) return { status: 200, body };
      }
      return { status: 404, body: null };
    },
  };
}

describe("crawlTeam", () => {
  it("returns parsed profile, ViewState ids, and scorecards for every played match", async () => {
    const fetcher = stubFetcher([
      [/t=3/, TEAM_PROFILE], // team profile
      [/t=7/, SCORECARD], // all scorecards return the same fixture body
    ]);

    const result = await crawlTeam(fetcher, {
      par1: "abc123",
      year: 2026,
    });

    expect(result.teamProfile.header.teamName).toMatch(/WALNUT CREEK/);
    expect(result.teamId).toBe("5083144154");
    // The fixture's schedule has played matches with matchIds; we should
    // have fetched a scorecard for each.
    expect(result.scorecards.length).toBeGreaterThan(0);
    for (const sc of result.scorecards) {
      expect(sc.matchId).toMatch(/^\d+$/);
      expect(sc.parsed.courts.length).toBeGreaterThan(0);
    }
    expect(result.errors).toEqual([]);
    // ids object is plain JSON (no Maps).
    expect(typeof result.ids.playersByName).toBe("object");
    expect(result.ids.playersByName["Stella So"]).toBe("2010200673");
  });

  it("invokes onRawHtml for the profile and each scorecard", async () => {
    const fetcher = stubFetcher([
      [/t=3/, TEAM_PROFILE],
      [/t=7/, SCORECARD],
    ]);
    const onRawHtml = vi.fn();
    const result = await crawlTeam(
      fetcher,
      { par1: "abc123", year: 2026 },
      { onRawHtml }
    );

    const kinds = onRawHtml.mock.calls.map((c) => c[0]);
    expect(kinds[0]).toBe("team-profile");
    const scorecardCalls = onRawHtml.mock.calls.filter(
      (c) => c[0] === "scorecard"
    );
    expect(scorecardCalls.length).toBe(result.scorecards.length);
  });

  it("captures scorecard fetch failures in errors[] without aborting", async () => {
    const fetcher: CrawlFetcher = {
      async fetch(url: string) {
        if (/t=3/.test(url)) return { status: 200, body: TEAM_PROFILE };
        throw new Error("network down");
      },
    };
    const result = await crawlTeam(fetcher, {
      par1: "abc123",
      year: 2026,
    });
    expect(result.scorecards).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.step).toBe("scorecard");
    expect(result.errors[0]!.message).toContain("network down");
  });

  it("throws when the team profile body is empty", async () => {
    const fetcher: CrawlFetcher = {
      async fetch() {
        return { status: 500, body: null };
      },
    };
    await expect(
      crawlTeam(fetcher, { par1: "abc123", year: 2026 })
    ).rejects.toThrow(/team-profile/);
  });

  it("skips upcoming matches by default but includes them when asked", async () => {
    const fetcher = stubFetcher([
      [/t=3/, TEAM_PROFILE],
      [/t=7/, SCORECARD],
    ]);
    const defaultRun = await crawlTeam(fetcher, {
      par1: "abc123",
      year: 2026,
    });
    const includeAll = await crawlTeam(
      fetcher,
      { par1: "abc123", year: 2026 },
      { includeUpcoming: true }
    );
    expect(includeAll.scorecards.length).toBeGreaterThanOrEqual(
      defaultRun.scorecards.length
    );
  });
});

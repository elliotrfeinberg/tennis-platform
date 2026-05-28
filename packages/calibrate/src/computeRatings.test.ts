import { describe, expect, it } from "vitest";
import { computeRatings, labeledRows } from "./computeRatings.js";
import type { CapturesData, CourtMatch, PlayerLabel } from "./loadCaptures.js";

// Build a tiny synthetic CapturesData for unit-testing the chronological
// driver. Player keys are stable so we can assert on them.
function mkCaptures(
  players: Array<Omit<PlayerLabel, "key"> & { key: string }>,
  matches: CourtMatch[]
): CapturesData {
  const pmap = new Map<string, PlayerLabel>();
  for (const p of players) pmap.set(p.key, p);
  return {
    year: 2026,
    ownTeamName: "Test Team A",
    ownTeamId: "9999999999",
    players: pmap,
    matches,
    unresolvedNames: [],
    yearEndLabelMatches: 0,
    yearEndLabelOverrides: 0,
    yearEndUnmatched: 0,
  };
}

function mkMatch(
  date: Date,
  home: string[],
  visitor: string[],
  homeWon: boolean
): CourtMatch {
  return {
    matchId: `m-${date.getTime()}-${home[0]}-${visitor[0]}`,
    date,
    homeTeamName: "Home",
    visitorTeamName: "Visitor",
    line: 1,
    kind: home.length > 1 ? "D" : "S",
    homePlayerKeys: home,
    visitorPlayerKeys: visitor,
    homeWon,
    retired: undefined,
    defaulted: undefined,
  };
}

describe("computeRatings", () => {
  it("raises a consistent winner's rating above a consistent loser's", () => {
    // A beats B 5 times in singles. Ratings should converge with A > B.
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: undefined, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: undefined, teams: [] },
      ],
      Array.from({ length: 5 }, (_, i) =>
        mkMatch(new Date(2026, 0, i + 1), ["A"], ["B"], true)
      )
    );
    const { ratings, matchCounts, skipped } = computeRatings(captures);
    expect(skipped).toBe(0);
    expect(matchCounts.get("A")).toBe(5);
    expect(matchCounts.get("B")).toBe(5);
    expect(ratings.get("A")!.rating).toBeGreaterThan(
      ratings.get("B")!.rating
    );
    // RD should drop below 350 (default) after 5 matches.
    expect(ratings.get("A")!.rd).toBeLessThan(350);
    expect(ratings.get("B")!.rd).toBeLessThan(350);
  });

  it("skips matches with undefined winners", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: undefined, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: undefined, teams: [] },
      ],
      [
        {
          matchId: "x",
          date: new Date(2026, 0, 1),
          homeTeamName: "H",
          visitorTeamName: "V",
          line: 1,
          kind: "S",
          homePlayerKeys: ["A"],
          visitorPlayerKeys: ["B"],
          homeWon: undefined,
          retired: undefined,
          defaulted: undefined,
        },
      ]
    );
    const { ratings, skipped } = computeRatings(captures);
    expect(skipped).toBe(1);
    expect(ratings.size).toBe(0);
  });

  it("updates both doubles partners' ratings against the same opponent-side mean", () => {
    // A+B beat C+D. Both A and B should see identical update (same
    // pre-rating, same opponent-side mean) — proves we snapshot the
    // mean before mutating either player.
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: undefined, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: undefined, teams: [] },
        { key: "C", name: "C", memberId: undefined, ntrp: undefined, teams: [] },
        { key: "D", name: "D", memberId: undefined, ntrp: undefined, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A", "B"], ["C", "D"], true)]
    );
    const { ratings } = computeRatings(captures);
    expect(ratings.get("A")!.rating).toBeCloseTo(ratings.get("B")!.rating, 6);
    expect(ratings.get("C")!.rating).toBeCloseTo(ratings.get("D")!.rating, 6);
    expect(ratings.get("A")!.rating).toBeGreaterThan(ratings.get("C")!.rating);
  });

  it("labeledRows filters by minMatches and NTRP-presence", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: "1", ntrp: 3.5, teams: ["T"] },
        { key: "B", name: "B", memberId: "2", ntrp: undefined, teams: ["T"] },
        { key: "C", name: "C", memberId: "3", ntrp: 3.5, teams: ["T"] },
      ],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], true),
        mkMatch(new Date(2026, 0, 2), ["A"], ["B"], true),
        mkMatch(new Date(2026, 0, 3), ["A"], ["B"], true),
      ]
    );
    const result = computeRatings(captures);
    const rows = labeledRows(captures, result, { minMatches: 3 });
    // Only A has NTRP and ≥3 matches; B has no NTRP, C has no matches.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("A");
  });
});

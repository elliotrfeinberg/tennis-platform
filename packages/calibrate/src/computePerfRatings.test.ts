import { describe, expect, it } from "vitest";
import { computePerfRatings } from "./computePerfRatings.js";
import type { CapturesData, CourtMatch, PlayerLabel } from "./loadCaptures.js";

function mkCaptures(
  players: Array<Omit<PlayerLabel, "key"> & { key: string }>,
  matches: CourtMatch[]
): CapturesData {
  const pmap = new Map<string, PlayerLabel>();
  for (const p of players) pmap.set(p.key, p);
  return {
    year: 2026,
    ownTeamName: "Test",
    ownTeamId: "0",
    players: pmap,
    matches,
    unresolvedNames: [],
    yearEndLabelMatches: 0,
    yearEndLabelOverrides: 0,
    yearEndUnmatched: 0,
  };
}

// Build a match with 2 sets at the given per-set scores (from the home
// side's perspective). `set1` and `set2` are `[homeGames, visitorGames]`.
function mkMatch(
  date: Date,
  home: string[],
  visitor: string[],
  set1: [number, number],
  set2: [number, number],
  set3?: [number, number]
): CourtMatch {
  const sets = set3 !== undefined ? [set1, set2, set3] : [set1, set2];
  let gh = 0;
  let gv = 0;
  let setsWonByHome = 0;
  for (const [h, v] of sets) {
    gh += h;
    gv += v;
    if (h > v) setsWonByHome += 1;
  }
  return {
    matchId: `m-${date.getTime()}-${home[0]}-${visitor[0]}`,
    date,
    homeTeamName: "H",
    visitorTeamName: "V",
    line: 1,
    kind: home.length > 1 ? "D" : "S",
    homePlayerKeys: home,
    visitorPlayerKeys: visitor,
    homeWon: setsWonByHome >= 2,
    retired: undefined,
    defaulted: undefined,
    gamesHome: gh,
    gamesVisitor: gv,
    sets: sets.map(([h, v]) => ({ home: h, visitor: v })),
  };
}

describe("computePerfRatings", () => {
  it("a single 6-0, 6-0 win shifts winner +0.48 above opponent's initial NTRP", () => {
    // Opponent starts at 3.0 (NTRP label). Winner starts at 3.0 too,
    // but their post-match perf history has one entry at 3.48
    // (opponent_initial + 0.48, the empirical median for 6-0, 6-0).
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.0, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.0, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 0], [6, 0])]
    );
    const result = computePerfRatings(captures);
    expect(result.ratings.get("A")!).toBeCloseTo(3.48, 6);
    expect(result.ratings.get("B")!).toBeCloseTo(2.52, 6);
  });

  it("a 7-6, 7-6 sweep lands per the table at ±0.05", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [7, 6], [7, 6])]
    );
    const result = computePerfRatings(captures);
    expect(result.ratings.get("A")!).toBeCloseTo(3.55, 6);
    expect(result.ratings.get("B")!).toBeCloseTo(3.45, 6);
  });

  it("winning by retirement after losing more games still credits the winner", () => {
    // Won by opponent retirement after losing first set 3-6, leading
    // 3-2 in the second. Total games 6 won vs 8 lost — pure game-margin
    // would say winner played BELOW opp. Match-win bonus saves it.
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [
        {
          matchId: "ret",
          date: new Date(2026, 0, 1),
          homeTeamName: "H",
          visitorTeamName: "V",
          line: 1,
          kind: "S",
          homePlayerKeys: ["A"],
          visitorPlayerKeys: ["B"],
          homeWon: true, // A won by retirement
          retired: "visitor",
          defaulted: undefined,
          gamesHome: 6,
          gamesVisitor: 8,
          // 3-6 (lost), 3-2 (in progress, opp retired)
          sets: [
            { home: 3, visitor: 6 },
            { home: 3, visitor: 2 },
          ],
        },
      ]
    );
    const result = computePerfRatings(captures);
    // A "retirement win" where you were trailing in game count
    // intentionally produces a perf rating CLOSE to opp — neither
    // strongly positive nor strongly negative. The winner gets a slight
    // game-margin penalty offset by the small win bonus, netting a few
    // hundredths below opp. What matters is that the winner is rated
    // HIGHER than the loser (the match result is still reflected).
    const a = result.ratings.get("A")!;
    const b = result.ratings.get("B")!;
    expect(a).toBeGreaterThan(b);
    // Both stay within ±0.1 of opp — close match, soft win.
    expect(Math.abs(a - 3.5)).toBeLessThan(0.1);
    expect(Math.abs(b - 3.5)).toBeLessThan(0.1);
  });

  it("a player with no matches keeps their NTRP-label initial rating", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 4.0, teams: [] },
      ],
      [] // no matches
    );
    const result = computePerfRatings(captures);
    // No history at all → ratings map is empty; current rating comes
    // from the initial fn on demand.
    expect(result.ratings.size).toBe(0);
    expect(result.history.size).toBe(0);
  });

  it("disjoint clusters DON'T drift toward a shared prior — each anchors at opponent rating", () => {
    // A and B both label-3.0; C and D both label-4.0. Each cluster plays
    // 5 matches internally, no cross-cluster matches. Cluster means should
    // STAY near 3.0 and 4.0 respectively (not converge to 3.5 like Glicko
    // does without a prior).
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.0, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.0, teams: [] },
        { key: "C", name: "C", memberId: undefined, ntrp: 4.0, teams: [] },
        { key: "D", name: "D", memberId: undefined, ntrp: 4.0, teams: [] },
      ],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 4], [6, 4]),
        mkMatch(new Date(2026, 0, 2), ["A"], ["B"], [6, 4], [6, 4]),
        mkMatch(new Date(2026, 0, 3), ["A"], ["B"], [6, 4], [6, 4]),
        mkMatch(new Date(2026, 0, 1), ["C"], ["D"], [6, 4], [6, 4]),
        mkMatch(new Date(2026, 0, 2), ["C"], ["D"], [6, 4], [6, 4]),
        mkMatch(new Date(2026, 0, 3), ["C"], ["D"], [6, 4], [6, 4]),
      ]
    );
    const result = computePerfRatings(captures);
    // A consistently beats B 6-4 — A drifts above 3.0, B below.
    expect(result.ratings.get("A")!).toBeGreaterThan(3.0);
    expect(result.ratings.get("B")!).toBeLessThan(3.0);
    expect(result.ratings.get("A")!).toBeLessThan(3.5);
    // C drifts above 4.0, D below.
    expect(result.ratings.get("C")!).toBeGreaterThan(4.0);
    expect(result.ratings.get("D")!).toBeLessThan(4.0);
    expect(result.ratings.get("D")!).toBeGreaterThan(3.5);
    // Critically: C remains clearly higher than A — clusters stay
    // anchored to their respective NTRP bands.
    expect(result.ratings.get("C")! - result.ratings.get("A")!).toBeGreaterThan(0.5);
  });

  it("history entries appear in chronological order", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 0], [6, 0]),
        mkMatch(new Date(2026, 0, 5), ["A"], ["B"], [0, 6], [0, 6]),
        mkMatch(new Date(2026, 0, 10), ["A"], ["B"], [6, 3], [6, 3]),
      ]
    );
    const result = computePerfRatings(captures);
    const aHistory = result.history.get("A")!;
    expect(aHistory).toHaveLength(3);
    expect(aHistory[0]!.date.getTime()).toBeLessThan(aHistory[1]!.date.getTime());
    expect(aHistory[1]!.date.getTime()).toBeLessThan(aHistory[2]!.date.getTime());
    // Diagnostic fields are populated.
    expect(aHistory[0]!.opponentRating).toBeCloseTo(3.5, 6);
    expect(aHistory[0]!.gamesDiff).toBe(12); // 12-0 across 6-0, 6-0 in match 1
  });

  it("doubles partners with the same pre-match rating get the same per-match perf rating", () => {
    // When both partners come in at the same rating, individual_perf =
    // team_perf + 0 = team_perf — so they get equal credit.
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "C", name: "C", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "D", name: "D", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A", "B"], ["C", "D"], [6, 2], [6, 2])]
    );
    const result = computePerfRatings(captures);
    expect(result.history.get("A")![0]!.perf).toBeCloseTo(
      result.history.get("B")![0]!.perf,
      6
    );
    expect(result.history.get("C")![0]!.perf).toBeCloseTo(
      result.history.get("D")![0]!.perf,
      6
    );
  });

  it("doubles partners with different pre-match ratings preserve their spread (USTA attribution)", () => {
    // Verified against real tennisrecord DMR data: same match,
    // partner A pre=3.27, B pre=3.75, team_perf=3.41 →
    // A_perf=3.17, B_perf=3.65 (spread preserved at 0.48).
    //
    // Here: A_pre=3.27, B_pre=3.75 → mean 3.51. Opp at 3.795 (C=4.12,
    // D=3.47). Loss 6-2, 6-0 → table delta 0.40 → A+B team_perf =
    // 3.795 - 0.40 = 3.395. Then:
    //   A_perf = 3.395 + (3.27 - 3.51) = 3.155
    //   B_perf = 3.395 + (3.75 - 3.51) = 3.635
    // Spread between A and B = 0.48 (matches pre-match spread exactly).
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.27, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.75, teams: [] },
        { key: "C", name: "C", memberId: undefined, ntrp: 4.12, teams: [] },
        { key: "D", name: "D", memberId: undefined, ntrp: 3.47, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A", "B"], ["C", "D"], [2, 6], [0, 6])]
    );
    const result = computePerfRatings(captures);
    const aPerf = result.history.get("A")![0]!.perf;
    const bPerf = result.history.get("B")![0]!.perf;
    // Spread preserved between partners.
    expect(bPerf - aPerf).toBeCloseTo(3.75 - 3.27, 6);
    // Both partners' perfs sum to 2 * team_perf.
    const opponentMean = (4.12 + 3.47) / 2;
    const winnerTableValue = 0.4; // 6-0, 6-2 → 0.40 in TWO_SET_SWEEP_TABLE
    const teamPerfExpected = opponentMean - winnerTableValue;
    expect((aPerf + bPerf) / 2).toBeCloseTo(teamPerfExpected, 6);
  });
});

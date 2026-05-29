import { describe, expect, it } from "vitest";
import {
  computePerfRatings,
  type PerfMatchEntry,
} from "./computePerfRatings.js";
import type { CapturesData, CourtMatch, PlayerLabel } from "./loadCaptures.js";

function mkCaptures(
  players: Array<
    Omit<PlayerLabel, "key" | "ntrpByYear" | "ratingType"> & {
      key: string;
      ntrpByYear?: Map<number, number>;
      ratingType?: string;
    }
  >,
  matches: CourtMatch[],
  year = 2026
): CapturesData {
  const pmap = new Map<string, PlayerLabel>();
  for (const p of players) {
    const ntrpByYear =
      p.ntrpByYear ??
      (p.ntrp !== undefined
        ? new Map<number, number>([[year, p.ntrp]])
        : new Map<number, number>());
    pmap.set(p.key, { ...p, ntrpByYear, ratingType: p.ratingType });
  }
  return {
    year,
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
  set3?: [number, number],
  league?: string
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
    league: league ?? "ADULT 18&Over",
    seasonYear: date.getFullYear(),
  };
}

describe("computePerfRatings", () => {
  it("a single 6-0, 6-0 win splits the table gap (±0.24) around the shared midpoint", () => {
    // Both labeled 3.0 → initial rating = band midpoint 2.75 each. The table
    // gap for 6-0,6-0 is 0.48; with equal pre-ratings the midpoint is 2.75,
    // so winner = 2.75 + 0.24 = 2.99 and loser = 2.75 − 0.24 = 2.51 (gap 0.48).
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.0, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.0, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 0], [6, 0])]
    );
    const result = computePerfRatings(captures);
    expect(result.ratings.get("A")!).toBeCloseTo(2.99, 6);
    expect(result.ratings.get("B")!).toBeCloseTo(2.51, 6);
  });

  it("a 7-6, 7-6 sweep splits the ±0.05 table gap around the midpoint", () => {
    // Both labeled 3.5 → initial = 3.25. Table gap 0.05 → winner 3.275,
    // loser 3.225 (each ±0.025 from the 3.25 midpoint).
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [7, 6], [7, 6])]
    );
    const result = computePerfRatings(captures);
    expect(result.ratings.get("A")!).toBeCloseTo(3.275, 6);
    expect(result.ratings.get("B")!).toBeCloseTo(3.225, 6);
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
          league: "ADULT 18&Over",
          seasonYear: 2026,
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
    // Both labeled 3.5 → opp anchor = midpoint 3.25. Both stay within
    // ±0.15 of that — close match, soft win.
    expect(Math.abs(a - 3.25)).toBeLessThan(0.15);
    expect(Math.abs(b - 3.25)).toBeLessThan(0.15);
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
    // A consistently beats B 6-4 — A drifts above the 3.0 band midpoint
    // (2.75), B below. Both stay within the 3.0 band (roughly).
    expect(result.ratings.get("A")!).toBeGreaterThan(2.75);
    expect(result.ratings.get("B")!).toBeLessThan(2.75);
    expect(result.ratings.get("A")!).toBeLessThan(3.25);
    // C drifts above 3.75 (4.0 band midpoint), D below.
    expect(result.ratings.get("C")!).toBeGreaterThan(3.75);
    expect(result.ratings.get("D")!).toBeLessThan(3.75);
    expect(result.ratings.get("D")!).toBeGreaterThan(3.25);
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
    // Diagnostic fields are populated. Opp anchor = 3.5 band midpoint.
    expect(aHistory[0]!.opponentRating).toBeCloseTo(3.25, 6);
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
    // Spread between partners is preserved exactly; only the team LEVEL moves
    // (symmetric split model). ntrp values here are CONTINUOUS pre-match
    // ratings (not band labels), so we pass initialRating to use them
    // verbatim (cold-start anchor == pre, so anchorMean == raw mean).
    //
    // A_pre=3.27, B_pre=3.75 → ownMean 3.51. Opp C=4.12, D=3.47 → oppMean
    // 3.795. Loss 6-2, 6-0 → table gap 0.40, signed −0.40 for A/B. midpoint
    // (3.51+3.795)/2 = 3.6525 → team_perf = 3.6525 − 0.40/2 = 3.4525. Then:
    //   A_perf = 3.4525 + (3.27 − 3.51) = 3.2125
    //   B_perf = 3.4525 + (3.75 − 3.51) = 3.6925
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
    const result = computePerfRatings(captures, {
      initialRating: (p) => p.ntrp ?? 3.25,
    });
    const aPerf = result.history.get("A")![0]!.perf;
    const bPerf = result.history.get("B")![0]!.perf;
    // Spread preserved between partners.
    expect(bPerf - aPerf).toBeCloseTo(3.75 - 3.27, 6);
    // Team perf = match midpoint + signed delta/2 (symmetric split).
    const ownMean = (3.27 + 3.75) / 2; // 3.51
    const oppMean = (4.12 + 3.47) / 2; // 3.795
    const winnerTableValue = 0.4; // 6-0, 6-2 → 0.40 in TWO_SET_SWEEP_TABLE
    const teamPerfExpected = (ownMean + oppMean) / 2 - winnerTableValue / 2;
    expect((aPerf + bPerf) / 2).toBeCloseTo(teamPerfExpected, 6);
  });

  it("symmetric split: doubles win moves each player from their own pre by ±surprise/2", () => {
    // Project-owner worked model. A(3.10)/B(3.70) [mean 3.40] beat
    // C(3.25)/D(3.35) [mean 3.30] — here 6-1,6-1 → table gap 0.40.
    // midpoint 3.35 → winner team 3.55, loser team 3.15 (gap 0.40).
    // Each player moves from THEIR OWN pre by the same ±(team−mean):
    //   A 3.10→3.25, B 3.70→3.85  (home +0.15 each, spread 0.60 kept)
    //   C 3.25→3.10, D 3.35→3.20  (visitor −0.15 each, spread 0.10 kept)
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.1, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.7, teams: [] },
        { key: "C", name: "C", memberId: undefined, ntrp: 3.25, teams: [] },
        { key: "D", name: "D", memberId: undefined, ntrp: 3.35, teams: [] },
      ],
      [mkMatch(new Date(2026, 0, 1), ["A", "B"], ["C", "D"], [6, 1], [6, 1])]
    );
    const result = computePerfRatings(captures, {
      initialRating: (p) => p.ntrp ?? 3.25,
    });
    expect(result.history.get("A")![0]!.perf).toBeCloseTo(3.25, 6);
    expect(result.history.get("B")![0]!.perf).toBeCloseTo(3.85, 6);
    expect(result.history.get("C")![0]!.perf).toBeCloseTo(3.1, 6);
    expect(result.history.get("D")![0]!.perf).toBeCloseTo(3.2, 6);
  });

  it("mixed match updates mixed rating, not adult", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [
        mkMatch(
          new Date(2026, 0, 1),
          ["A"],
          ["B"],
          [6, 3],
          [6, 3],
          undefined,
          "Mixed 18&Over"
        ),
      ]
    );
    const result = computePerfRatings(captures);
    const pr = result.playerRatings.get("A")!;
    expect(pr.mixed).toBeDefined();
    expect(pr.adult).toBeUndefined();
    expect(pr.mixedMatches).toBe(1);
    expect(pr.adultMatches).toBe(0);
  });

  it("combo match doesn't update either rating but appears in history", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [
        // First: an adult match so A has an adult rating.
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 3], [6, 3]),
        // Then: a combo match.
        mkMatch(
          new Date(2026, 0, 10),
          ["A"],
          ["B"],
          [6, 2],
          [6, 2],
          undefined,
          "Combo 7.5"
        ),
      ]
    );
    const result = computePerfRatings(captures);
    const pr = result.playerRatings.get("A")!;
    // Adult rating stays at the value from the first match only.
    expect(pr.adultMatches).toBe(1);
    expect(pr.mixedMatches).toBe(0);
    expect(pr.otherMatches).toBe(1);
    // Full history has both matches.
    const hist = result.history.get("A")!;
    expect(hist).toHaveLength(2);
    const comboEntry = hist[1]!;
    expect(comboEntry.affectsRating).toBe(false);
    expect(comboEntry.category).toBe("combo");
    // Shadow perf was still computed (non-null).
    expect(typeof comboEntry.perf).toBe("number");
  });

  it("combo match shadow perf uses adult rating when present", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.0, teams: [] },
      ],
      [
        // Adult matches to establish ratings: A ~3.40, B ~3.10.
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 3], [6, 3]),
        // Combo match with A and B.
        mkMatch(
          new Date(2026, 0, 10),
          ["A"],
          ["B"],
          [6, 3],
          [6, 3],
          undefined,
          "Combo 7.5"
        ),
      ]
    );
    const result = computePerfRatings(captures);
    const hist = result.history.get("A")!;
    const comboEntry = hist[1]!;
    expect(comboEntry.perfBasis).toBe("adult");
    // The opponent rating in the combo entry should be based on B's
    // current adult rating (not zero or cold-start).
    expect(comboEntry.opponentRating).toBeGreaterThan(2.5);
    expect(comboEntry.opponentRating).toBeLessThan(3.5);
  });

  it("combo match falls back to mixed basis when player has no adult rating", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [
        // Mixed match first → A gets a mixed rating but no adult rating.
        mkMatch(
          new Date(2026, 0, 1),
          ["A"],
          ["B"],
          [6, 3],
          [6, 3],
          undefined,
          "Mixed 18&Over"
        ),
        // Combo match next.
        mkMatch(
          new Date(2026, 0, 10),
          ["A"],
          ["B"],
          [6, 2],
          [6, 2],
          undefined,
          "Combo 7.5"
        ),
      ]
    );
    const result = computePerfRatings(captures);
    const hist = result.history.get("A")!;
    const comboEntry = hist[1]!;
    expect(comboEntry.perfBasis).toBe("mixed");
  });

  it("display rating prefers adult over mixed when both are present", () => {
    const captures = mkCaptures(
      [
        { key: "A", name: "A", memberId: undefined, ntrp: 3.5, teams: [] },
        { key: "B", name: "B", memberId: undefined, ntrp: 3.5, teams: [] },
      ],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 3], [6, 3]),
        mkMatch(
          new Date(2026, 0, 5),
          ["A"],
          ["B"],
          [6, 3],
          [6, 3],
          undefined,
          "Mixed 18&Over"
        ),
      ]
    );
    const result = computePerfRatings(captures);
    const pr = result.playerRatings.get("A")!;
    expect(pr.adult).toBeDefined();
    expect(pr.mixed).toBeDefined();
    // Display is adult, not mixed.
    expect(pr.display).toBe(pr.adult);
  });

  describe("year-boundary carry-over", () => {
    const in2026 = (entries: PerfMatchEntry[]) =>
      entries.filter((e) => e.date.getFullYear() === 2026);

    it("carries a rating within the new band over unchanged", () => {
      // A stays inside the 3.5 band (3.0, 3.5] across both seasons; the
      // 2026 carry-in should equal the 2025 final rating, untouched.
      const captures = mkCaptures(
        [
          {
            key: "A",
            name: "A",
            memberId: undefined,
            ntrp: 3.5,
            ntrpByYear: new Map([
              [2025, 3.5],
              [2026, 3.5],
            ]),
            teams: [],
          },
          {
            key: "B",
            name: "B",
            memberId: undefined,
            ntrp: 3.5,
            ntrpByYear: new Map([
              [2025, 3.5],
              [2026, 3.5],
            ]),
            teams: [],
          },
        ],
        [
          mkMatch(new Date(2025, 0, 1), ["A"], ["B"], [6, 4], [6, 4]),
          mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 4], [6, 4]),
        ]
      );
      const result = computePerfRatings(captures);
      const hist = result.history.get("A")!;
      const last2025 = hist[0]!;
      const first2026 = in2026(hist)[0]!;
      // Within band, so no clamp: carry-in == prior-year final.
      expect(first2026.playerPreRating).toBeCloseTo(last2025.playerPostRating, 6);
      expect(last2025.playerPostRating).toBeGreaterThan(3.0);
      expect(last2025.playerPostRating).toBeLessThanOrEqual(3.5);
    });

    it("clamps a carried rating down to the new band's top edge", () => {
      // A ends 2025 well above 3.5 but is a 3.5 in 2026 → carry-in clamps
      // to the band ceiling (3.5).
      const captures = mkCaptures(
        [
          {
            key: "A",
            name: "A",
            memberId: undefined,
            ntrp: 4.0,
            ntrpByYear: new Map([
              [2025, 4.0],
              [2026, 3.5],
            ]),
            teams: [],
          },
          {
            key: "B",
            name: "B",
            memberId: undefined,
            ntrp: 4.0,
            ntrpByYear: new Map([
              [2025, 4.0],
              [2026, 4.0],
            ]),
            teams: [],
          },
        ],
        [
          mkMatch(new Date(2025, 0, 1), ["A"], ["B"], [6, 0], [6, 0]),
          mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 0], [6, 0]),
        ]
      );
      const result = computePerfRatings(captures);
      const hist = result.history.get("A")!;
      expect(hist[0]!.playerPostRating).toBeGreaterThan(3.5);
      expect(in2026(hist)[0]!.playerPreRating).toBeCloseTo(3.5, 6);
      // The synthetic carry-in seed is NOT counted as a played match.
      expect(result.playerRatings.get("A")!.adultMatches).toBe(2);
    });

    it("clamps a carried rating up to the new band's bottom edge", () => {
      // A ends 2025 below 3.0 but is registered 3.5 in 2026 → carry-in
      // clamps up to the band floor (3.0).
      const captures = mkCaptures(
        [
          {
            key: "A",
            name: "A",
            memberId: undefined,
            ntrp: 2.5,
            ntrpByYear: new Map([
              [2025, 2.5],
              [2026, 3.5],
            ]),
            teams: [],
          },
          {
            key: "B",
            name: "B",
            memberId: undefined,
            ntrp: 2.5,
            ntrpByYear: new Map([
              [2025, 2.5],
              [2026, 2.5],
            ]),
            teams: [],
          },
        ],
        [
          mkMatch(new Date(2025, 0, 1), ["A"], ["B"], [0, 6], [0, 6]),
          mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [0, 6], [0, 6]),
        ]
      );
      const result = computePerfRatings(captures);
      const hist = result.history.get("A")!;
      expect(hist[0]!.playerPostRating).toBeLessThan(3.0);
      expect(in2026(hist)[0]!.playerPreRating).toBeCloseTo(3.0, 6);
    });

    it("reseeds the rolling window at the boundary (carry-in + new matches only)", () => {
      // Three lopsided 2025 wins would, without a reset, dominate the
      // last-10 window into 2026. With reseeding, the first 2026 rating
      // is exactly the mean of the clamped carry-in and that match's perf.
      const captures = mkCaptures(
        [
          {
            key: "A",
            name: "A",
            memberId: undefined,
            ntrp: 4.0,
            ntrpByYear: new Map([
              [2025, 4.0],
              [2026, 3.5],
            ]),
            teams: [],
          },
          {
            key: "B",
            name: "B",
            memberId: undefined,
            ntrp: 4.0,
            ntrpByYear: new Map([
              [2025, 4.0],
              [2026, 4.0],
            ]),
            teams: [],
          },
        ],
        [
          mkMatch(new Date(2025, 0, 1), ["A"], ["B"], [6, 0], [6, 0]),
          mkMatch(new Date(2025, 0, 8), ["A"], ["B"], [6, 0], [6, 0]),
          mkMatch(new Date(2025, 0, 15), ["A"], ["B"], [6, 0], [6, 0]),
          mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 3], [6, 3]),
        ]
      );
      const result = computePerfRatings(captures);
      const first2026 = in2026(result.history.get("A")!)[0]!;
      // post == mean(carry-in=3.5, this match's perf), proving the window
      // was reseeded (only seed + 1 entry contribute, not the 3 prior).
      expect(first2026.playerPostRating).toBeCloseTo(
        (3.5 + first2026.perf) / 2,
        6
      );
    });
  });

  describe("confidence-weighted anchor", () => {
    // N (band 3.5, prior 3.25) wins big in match 1, jumping their rolling
    // rating well above the band prior. When N then anchors an opponent's
    // perf in match 2 — still only N's 2nd match — their inflated rating
    // must be DISCOUNTED toward the prior, not trusted at face value.
    it("discounts a provisional player's rating toward their band prior when anchoring", () => {
      const captures = mkCaptures(
        [
          { key: "N", name: "N", memberId: undefined, ntrp: 3.5, teams: [] },
          { key: "X", name: "X", memberId: undefined, ntrp: 3.5, teams: [] },
          { key: "E", name: "E", memberId: undefined, ntrp: 3.5, teams: [] },
        ],
        [
          // Match 1: N crushes X → N's rolling jumps to 3.25 + 0.48 = 3.73.
          mkMatch(new Date(2026, 0, 1), ["N"], ["X"], [6, 0], [6, 0]),
          // Match 2: E vs N. N now has 1 prior match → confidence 1/3.
          mkMatch(new Date(2026, 0, 5), ["E"], ["N"], [6, 4], [6, 4]),
        ]
      );
      const result = computePerfRatings(captures);
      // Symmetric split: a 6-0,6-0 win from the 3.25 midpoint moves N by
      // +0.48/2 = +0.24 → rolling 3.49 (not the old +0.48).
      const nRolling = 3.25 + 0.24; // 3.49
      const expectedAnchor = (1 / 3) * nRolling + (2 / 3) * 3.25; // 3.33
      // E's match-2 entry was computed against the DISCOUNTED N anchor.
      const eEntry = result.history.get("E")![0]!;
      expect(eEntry.opponentRating).toBeCloseTo(expectedAnchor, 6);
      // Sanity: that's a real discount off N's raw rolling rating.
      expect(eEntry.opponentRating).toBeLessThan(nRolling - 0.1);
    });

    it("trusts a player's full rating as an anchor once established (>=3 matches)", () => {
      const captures = mkCaptures(
        [
          { key: "N", name: "N", memberId: undefined, ntrp: 3.5, teams: [] },
          { key: "X", name: "X", memberId: undefined, ntrp: 3.5, teams: [] },
          { key: "E", name: "E", memberId: undefined, ntrp: 3.5, teams: [] },
        ],
        [
          // N plays 3 matches vs X to become established.
          mkMatch(new Date(2026, 0, 1), ["N"], ["X"], [6, 3], [6, 3]),
          mkMatch(new Date(2026, 0, 5), ["N"], ["X"], [6, 3], [6, 3]),
          mkMatch(new Date(2026, 0, 9), ["N"], ["X"], [6, 3], [6, 3]),
          // 4th match: E vs N. N has 3 prior matches → confidence 1.
          mkMatch(new Date(2026, 0, 13), ["E"], ["N"], [6, 4], [6, 4]),
        ]
      );
      const result = computePerfRatings(captures);
      // N's rolling rating going into match 4 == the anchor E saw (no
      // discount), since N is now fully established.
      const nHist = result.history.get("N")!;
      const nRollingBeforeMatch4 = nHist[2]!.playerPostRating;
      const eEntry = result.history.get("E")![0]!;
      expect(eEntry.opponentRating).toBeCloseTo(nRollingBeforeMatch4, 6);
    });

    it("self-rated players stay discounted longer than computer-rated", () => {
      // Two identical histories; the only difference is rating type. After
      // exactly 3 matches a computer-rate is fully trusted (c=1) while a
      // self-rate is not (c=3/5), so the self-rate's anchor is pulled
      // further toward the band prior.
      const mk = (type: string | undefined) =>
        mkCaptures(
          [
            {
              key: "N",
              name: "N",
              memberId: undefined,
              ntrp: 3.5,
              ratingType: type,
              teams: [],
            },
            { key: "X", name: "X", memberId: undefined, ntrp: 3.5, teams: [] },
            { key: "E", name: "E", memberId: undefined, ntrp: 3.5, teams: [] },
          ],
          [
            mkMatch(new Date(2026, 0, 1), ["N"], ["X"], [6, 2], [6, 2]),
            mkMatch(new Date(2026, 0, 5), ["N"], ["X"], [6, 2], [6, 2]),
            mkMatch(new Date(2026, 0, 9), ["N"], ["X"], [6, 2], [6, 2]),
            mkMatch(new Date(2026, 0, 13), ["E"], ["N"], [6, 4], [6, 4]),
          ]
        );
      const comp = computePerfRatings(mk("C"));
      const self = computePerfRatings(mk("S"));
      const compAnchor = comp.history.get("E")![0]!.opponentRating;
      const selfAnchor = self.history.get("E")![0]!.opponentRating;
      // N has been winning, so rolling > prior (3.25). The self-rate is
      // discounted toward the prior, landing strictly below the trusted
      // computer-rate anchor.
      expect(selfAnchor).toBeLessThan(compAnchor);
      expect(selfAnchor).toBeGreaterThan(3.25);
    });
  });
});

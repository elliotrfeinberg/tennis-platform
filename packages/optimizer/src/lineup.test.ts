import { describe, expect, it } from "vitest";
import { FORMAT_ADULT_18, FORMAT_MIXED_5D } from "./format.js";
import { resolveFormat, formatPoints } from "./leagueFormats.js";
import {
  evaluateLineup,
  optimizeLineup,
  pairKey,
  teamWinProbability,
  type OpponentLineup,
  type RosterPlayer,
} from "./lineup.js";

// Ratings are NTRP perf ratings. Same value for both kinds unless a test needs
// a split.
function player(id: string, r: number): RosterPlayer {
  return {
    id,
    name: id.toUpperCase(),
    singlesRating: r,
    doublesRating: r,
    available: true,
  };
}

describe("teamWinProbability (equal-weight courts)", () => {
  it("returns ~1 when all courts favored", () => {
    expect(teamWinProbability([0.99, 0.99, 0.99, 0.99, 0.99])).toBeGreaterThan(0.99);
  });

  it("returns ~0 when all courts unfavored", () => {
    expect(teamWinProbability([0.01, 0.01, 0.01, 0.01, 0.01])).toBeLessThan(0.01);
  });

  it("5 coin flips -> ~50% for >=3 wins", () => {
    expect(teamWinProbability([0.5, 0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 5);
  });

  it("3-of-5 win probs", () => {
    expect(teamWinProbability([0.6, 0.6, 0.6, 0.6, 0.6])).toBeCloseTo(0.68256, 3);
  });
});

describe("teamWinProbability (weighted points)", () => {
  it("winning a 2-point court counts double toward the majority", () => {
    // points [2,1,1] total 4, need >2 → 3. Win the 2-pt court for sure, then
    // need at least one of two coin flips: 1 − 0.5·0.5 = 0.75.
    const p = teamWinProbability([
      { p: 1, points: 2 },
      { p: 0.5, points: 1 },
      { p: 0.5, points: 1 },
    ]);
    expect(p).toBeCloseTo(0.75, 6);
  });

  it("losing the 2-point court makes the rest insufficient to clinch", () => {
    // Lose D1 (2 pts) → max 2 points from the two 1-pt courts < 3 needed.
    const p = teamWinProbability([
      { p: 0, points: 2 },
      { p: 0.9, points: 1 },
      { p: 0.9, points: 1 },
    ]);
    expect(p).toBe(0);
  });

  it("all-1-point reduces exactly to the majority-of-courts case", () => {
    const weighted = teamWinProbability([
      { p: 0.6, points: 1 },
      { p: 0.6, points: 1 },
      { p: 0.6, points: 1 },
      { p: 0.6, points: 1 },
      { p: 0.6, points: 1 },
    ]);
    expect(weighted).toBeCloseTo(teamWinProbability([0.6, 0.6, 0.6, 0.6, 0.6]), 9);
  });
});

describe("resolveFormat", () => {
  it("40 & Over is 1S + 3D with D1 worth 2 points (win at 3 of 5)", () => {
    const f = resolveFormat("2026 ADULT 40&Over");
    expect(f.courts.filter((c) => c.kind === "S")).toHaveLength(1);
    expect(f.courts.filter((c) => c.kind === "D")).toHaveLength(3);
    const d1 = f.courts.find((c) => c.kind === "D" && c.index === 1)!;
    expect(d1.points).toBe(2);
    const { total, toClinch } = formatPoints(f);
    expect(total).toBe(5);
    expect(toClinch).toBe(3);
  });

  it("18 & Over is 2S + 3D, every court 1 point (win at 3 of 5)", () => {
    const f = resolveFormat("2025 ADULT 18&Over");
    expect(f.courts.filter((c) => c.kind === "S")).toHaveLength(2);
    expect(f.courts.filter((c) => c.kind === "D")).toHaveLength(3);
    expect(f.courts.every((c) => (c.points ?? 1) === 1)).toBe(true);
    expect(formatPoints(f)).toEqual({ total: 5, toClinch: 3 });
  });

  it("55 & Over and Mixed are 3 doubles (win at 2 of 3)", () => {
    for (const name of ["2026 ADULT 55&Over", "2026 MIXED 18&Over"]) {
      const f = resolveFormat(name);
      expect(f.courts).toHaveLength(3);
      expect(f.courts.every((c) => c.kind === "D")).toBe(true);
      expect(formatPoints(f)).toEqual({ total: 3, toClinch: 2 });
    }
  });

  it("Daytime is 1S + 2D regardless of age division", () => {
    const f = resolveFormat("2026 ADULT 40&Over - Daytime");
    expect(f.courts.filter((c) => c.kind === "S")).toHaveLength(1);
    expect(f.courts.filter((c) => c.kind === "D")).toHaveLength(2);
    // Daytime weights everything 1 (no D1×2 even at 40 & Over).
    expect(f.courts.every((c) => (c.points ?? 1) === 1)).toBe(true);
  });

  it("uses empirical lines when provided (odd out-of-section layouts)", () => {
    const f = resolveFormat("2026 DALLAS TENNIS 40 & Over ADULT W Friday", [
      { kind: "D", index: 1 },
      { kind: "D", index: 2 },
      { kind: "D", index: 3 },
      { kind: "D", index: 4 },
      { kind: "S", index: 1 },
    ]);
    expect(f.courts).toHaveLength(5);
    // 40 & Over rule still applies points to D1.
    expect(f.courts.find((c) => c.kind === "D" && c.index === 1)!.points).toBe(2);
  });
});

describe("optimizeLineup", () => {
  it("with 5D format and clearly stronger roster, top lineup has high win prob", () => {
    const roster: RosterPlayer[] = [
      player("a", 4.5), player("b", 4.3), player("c", 4.2), player("d", 4.1),
      player("e", 4.0), player("f", 3.9), player("g", 3.8), player("h", 3.7),
      player("i", 3.6), player("j", 3.5),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({ kind: "D" as const, a: 3.0, b: 2.9 })),
    };
    const result = optimizeLineup(roster, FORMAT_MIXED_5D, opponent, { topN: 3 });
    expect(result.byTeamWinProb.length).toBe(3);
    expect(result.byTeamWinProb[0]!.teamWinProb).toBeGreaterThan(0.8);
    expect(result.byTeamWinProb[0]!.teamWinProb).toBeGreaterThanOrEqual(result.byTeamWinProb[1]!.teamWinProb);
  });

  it("each player used at most once", () => {
    const roster: RosterPlayer[] = [
      player("a", 4.5), player("b", 4.3), player("c", 4.2), player("d", 4.1),
      player("e", 4.0), player("f", 3.9), player("g", 3.8), player("h", 3.7),
      player("i", 3.6), player("j", 3.5),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({ kind: "D" as const, a: 3.5, b: 3.5 })),
    };
    const result = optimizeLineup(roster, FORMAT_MIXED_5D, opponent, { topN: 1 });
    const usedIds = result.byTeamWinProb[0]!.assignments.flatMap((a) => a.ourPlayerIds);
    expect(new Set(usedIds).size).toBe(usedIds.length);
    expect(usedIds.length).toBe(10);
  });

  it("expected-points ranking can differ from team-win-prob ranking", () => {
    const roster: RosterPlayer[] = [
      player("strong1", 5.0), player("strong2", 4.9), player("strong3", 4.8),
      player("mid1", 3.5), player("mid2", 3.5), player("mid3", 3.5),
      player("weak1", 2.5), player("weak2", 2.5), player("weak3", 2.5), player("weak4", 2.5),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({ kind: "D" as const, a: 3.5, b: 3.5 })),
    };
    const result = optimizeLineup(roster, FORMAT_MIXED_5D, opponent, { topN: 5, includeExpectedPointsRanking: true });
    expect(result.byExpectedPoints).toBeDefined();
    for (const l of result.byTeamWinProb) expect(l.assignments.length).toBe(FORMAT_MIXED_5D.courts.length);
    for (const l of result.byExpectedPoints!) expect(l.assignments.length).toBe(FORMAT_MIXED_5D.courts.length);
  });

  it("Adult 18+ format mixes 2 singles + 3 doubles correctly", () => {
    const roster: RosterPlayer[] = [
      player("a", 4.5), player("b", 4.3), player("c", 4.2), player("d", 4.1),
      player("e", 4.0), player("f", 3.9), player("g", 3.8), player("h", 3.7),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_ADULT_18.courts.map((c) =>
        c.kind === "S" ? { kind: "S" as const, player: 3.5 } : { kind: "D" as const, a: 3.5, b: 3.5 }
      ),
    };
    const result = optimizeLineup(roster, FORMAT_ADULT_18, opponent, { topN: 1 });
    const top = result.byTeamWinProb[0]!;
    expect(top.assignments.filter((a) => a.slot.kind === "S")).toHaveLength(2);
    expect(top.assignments.filter((a) => a.slot.kind === "D")).toHaveLength(3);
    const allIds = top.assignments.flatMap((a) => a.ourPlayerIds);
    expect(new Set(allIds).size).toBe(8);
  });

  it("optimizes a real 40 & Over format (1S + 3D, D1 ×2)", () => {
    const format = resolveFormat("2026 ADULT 40&Over");
    const roster: RosterPlayer[] = [
      player("a", 4.2), player("b", 4.1), player("c", 4.0), player("d", 3.9),
      player("e", 3.8), player("f", 3.7), player("g", 3.6),
    ];
    const opponent: OpponentLineup = {
      courts: format.courts.map((c) =>
        c.kind === "S" ? { kind: "S" as const, player: 3.5 } : { kind: "D" as const, a: 3.5, b: 3.5 }
      ),
    };
    const result = optimizeLineup(roster, format, opponent, { topN: 1 });
    const top = result.byTeamWinProb[0]!;
    expect(top.assignments).toHaveLength(4); // 1S + 3D
    // The 2-point court is present and labelled.
    expect(top.assignments.find((a) => a.slot.kind === "D" && a.slot.index === 1)!.points).toBe(2);
    // Stronger roster vs a 3.5 wall → strong favorite.
    expect(top.teamWinProb).toBeGreaterThan(0.8);
  });

  it("respects available=false", () => {
    const roster: RosterPlayer[] = [
      { ...player("a", 4.5), available: false },
      player("b", 4.3), player("c", 4.2), player("d", 4.1), player("e", 4.0),
      player("f", 3.9), player("g", 3.8), player("h", 3.7), player("i", 3.6),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({ kind: "D" as const, a: 3.5, b: 3.5 })),
    };
    // 8 available, need 10. Should throw.
    expect(() => optimizeLineup(roster, FORMAT_MIXED_5D, opponent, { topN: 1 })).toThrow();
  });

  it("a +0.5 NTRP edge in singles is ~89% (calibrated scale 0.55)", () => {
    const roster: RosterPlayer[] = [
      player("s", 4.0), player("x1", 3.5), player("x2", 3.5), player("x3", 3.5),
      player("x4", 3.5), player("x5", 3.5), player("x6", 3.5), player("x7", 3.5),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_ADULT_18.courts.map((c) =>
        c.kind === "S" ? { kind: "S" as const, player: 3.5 } : { kind: "D" as const, a: 3.5, b: 3.5 }
      ),
    };
    const lineup = evaluateLineup(roster, FORMAT_ADULT_18, opponent, [["s"], ["x1"], ["x2", "x3"], ["x4", "x5"], ["x6", "x7"]]);
    // S1: our 4.0 vs their 3.5 → 0.5 edge at scale 0.55 → ~0.89.
    expect(lineup.assignments[0]!.winProb).toBeCloseTo(0.89, 1);
  });

  it("shrinks a court toward 50% when a participant has a thin same-kind record", () => {
    // Same +0.5 singles edge, but our player has only 1 singles match → the
    // confidence shrink pulls the ~0.89 toward a coin flip.
    const us: RosterPlayer = { id: "s", name: "S", singlesRating: 4.0, doublesRating: 4.0, singlesMatches: 1, available: true };
    const fillers = ["x1", "x2", "x3", "x4", "x5", "x6", "x7"].map((id) => player(id, 3.5));
    const roster = [us, ...fillers];
    const opponent: OpponentLineup = {
      courts: FORMAT_ADULT_18.courts.map((c) =>
        c.kind === "S" ? { kind: "S" as const, player: 3.5, matches: 20 } : { kind: "D" as const, a: 3.5, b: 3.5 }
      ),
    };
    const lineup = evaluateLineup(roster, FORMAT_ADULT_18, opponent, [["s"], ["x1"], ["x2", "x3"], ["x4", "x5"], ["x6", "x7"]]);
    const p = lineup.assignments[0]!.winProb;
    // confidence = min(1,20)/5 = 0.2 → 0.5 + 0.2·(0.89 − 0.5) ≈ 0.578.
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.65);
  });
});

describe("partner chemistry", () => {
  it("keeps an established pair together over a marginally-better split", () => {
    // 5D. Four similar players b,c,d,e plus two anchors. Without chemistry the
    // optimizer is free to pair any of them; with b+c marked as an established
    // pair, the recommended lineup should keep b and c together.
    const roster: RosterPlayer[] = [
      player("a", 4.2), player("b", 3.81), player("c", 3.79),
      player("d", 3.80), player("e", 3.80), player("f", 3.5),
      player("g", 3.5), player("h", 3.5), player("i", 3.5), player("j", 3.5),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({ kind: "D" as const, a: 3.7, b: 3.7 })),
    };
    const established = new Set([pairKey("b", "c")]);
    const result = optimizeLineup(roster, FORMAT_MIXED_5D, opponent, { topN: 1, establishedPairs: established });
    const top = result.byTeamWinProb[0]!;
    const bcTogether = top.assignments.some(
      (a) => a.ourPlayerIds.includes("b") && a.ourPlayerIds.includes("c")
    );
    expect(bcTogether).toBe(true);
    const bcCourt = top.assignments.find((a) => a.ourPlayerIds.includes("b"))!;
    expect(bcCourt.established).toBe(true);
  });
});

describe("discipline affinity", () => {
  it("slots a singles specialist into a singles court", () => {
    // 8 players, all equal ratings vs an equal opponent. One player ("spec")
    // almost exclusively plays singles — they should land at S1/S2, not in a
    // doubles court.
    const spec: RosterPlayer = {
      id: "spec", name: "SPEC", singlesRating: 3.8, doublesRating: 3.8,
      singlesMatches: 12, doublesMatches: 0, available: true,
    };
    const others = ["b", "c", "d", "e", "f", "g", "h"].map((id) => ({
      id, name: id.toUpperCase(), singlesRating: 3.8, doublesRating: 3.8,
      singlesMatches: 6, doublesMatches: 6, available: true,
    }));
    const roster: RosterPlayer[] = [spec, ...others];
    const opponent: OpponentLineup = {
      courts: FORMAT_ADULT_18.courts.map((c) =>
        c.kind === "S" ? { kind: "S" as const, player: 3.6 } : { kind: "D" as const, a: 3.6, b: 3.6 }
      ),
    };
    const result = optimizeLineup(roster, FORMAT_ADULT_18, opponent, { topN: 1 });
    const specCourt = result.byTeamWinProb[0]!.assignments.find((a) => a.ourPlayerIds.includes("spec"))!;
    expect(specCourt.slot.kind).toBe("S");
  });
});

describe("evaluateLineup", () => {
  it("evaluates a hand-picked lineup", () => {
    const roster: RosterPlayer[] = [
      player("a", 4.5), player("b", 4.3), player("c", 4.2), player("d", 4.1),
      player("e", 4.0), player("f", 3.9),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_ADULT_18.courts.map((c) =>
        c.kind === "S" ? { kind: "S" as const, player: 3.5 } : { kind: "D" as const, a: 3.5, b: 3.5 }
      ),
    };
    const lineup = evaluateLineup(roster, FORMAT_ADULT_18, opponent, [
      ["a"], ["b"], ["c", "d"], ["e", "f"], ["a", "b"],
    ]);
    expect(lineup.assignments).toHaveLength(5);
    expect(lineup.teamWinProb).toBeGreaterThan(0.5);
  });
});

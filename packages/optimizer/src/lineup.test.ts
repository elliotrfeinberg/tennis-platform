import { describe, expect, it } from "vitest";
import { newRating, type Rating } from "@tennis/ratings";
import { FORMAT_ADULT_18, FORMAT_MIXED_5D } from "./format.js";
import {
  evaluateLineup,
  optimizeLineup,
  teamWinProbability,
  type OpponentLineup,
  type RosterPlayer,
} from "./lineup.js";

function rating(r: number, rd = 60): Rating {
  return { rating: r, rd, vol: 0.06 };
}

function player(id: string, r: number, rd = 60): RosterPlayer {
  return { id, name: id.toUpperCase(), rating: rating(r, rd), available: true };
}

describe("teamWinProbability", () => {
  it("returns ~1 when all courts favored", () => {
    expect(teamWinProbability([0.99, 0.99, 0.99, 0.99, 0.99])).toBeGreaterThan(
      0.99
    );
  });

  it("returns ~0 when all courts unfavored", () => {
    expect(teamWinProbability([0.01, 0.01, 0.01, 0.01, 0.01])).toBeLessThan(
      0.01
    );
  });

  it("5 coin flips -> ~50% for >=3 wins", () => {
    expect(teamWinProbability([0.5, 0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 5);
  });

  it("3-of-5 win probs", () => {
    // P(>=3 of 5 with p=0.6 each) = C(5,3)*.6^3*.4^2 + C(5,4)*.6^4*.4 + .6^5
    // = 10*.216*.16 + 5*.1296*.4 + .07776 = .3456 + .2592 + .07776 = .68256
    expect(teamWinProbability([0.6, 0.6, 0.6, 0.6, 0.6])).toBeCloseTo(
      0.68256,
      3
    );
  });
});

describe("optimizeLineup", () => {
  it("with 5D format and clearly stronger roster, top lineup has high win prob", () => {
    const roster: RosterPlayer[] = [
      player("a", 1700),
      player("b", 1650),
      player("c", 1600),
      player("d", 1580),
      player("e", 1550),
      player("f", 1520),
      player("g", 1500),
      player("h", 1480),
      player("i", 1460),
      player("j", 1440),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({
        kind: "D" as const,
        a: rating(1400),
        b: rating(1380),
      })),
    };
    const result = optimizeLineup(roster, FORMAT_MIXED_5D, opponent, {
      topN: 3,
    });
    expect(result.byTeamWinProb.length).toBe(3);
    expect(result.byTeamWinProb[0]!.teamWinProb).toBeGreaterThan(0.8);
    // Ranking should be monotonic
    expect(result.byTeamWinProb[0]!.teamWinProb).toBeGreaterThanOrEqual(
      result.byTeamWinProb[1]!.teamWinProb
    );
  });

  it("each player used at most once", () => {
    const roster: RosterPlayer[] = [
      player("a", 1700),
      player("b", 1650),
      player("c", 1600),
      player("d", 1580),
      player("e", 1550),
      player("f", 1520),
      player("g", 1500),
      player("h", 1480),
      player("i", 1460),
      player("j", 1440),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({
        kind: "D" as const,
        a: rating(1500),
        b: rating(1500),
      })),
    };
    const result = optimizeLineup(roster, FORMAT_MIXED_5D, opponent, {
      topN: 1,
    });
    const usedIds = result.byTeamWinProb[0]!.assignments.flatMap(
      (a) => a.ourPlayerIds
    );
    expect(new Set(usedIds).size).toBe(usedIds.length);
    expect(usedIds.length).toBe(10);
  });

  it("expected-wins ranking can differ from team-win-prob ranking", () => {
    // Roster designed so "stack to win majority" beats "balance for sum".
    // Stacking 2 strong players vs 2 strong opps, then losing 3 weaker
    // courts by close margins, can yield more expected wins but lower
    // P(majority).
    const roster: RosterPlayer[] = [
      player("strong1", 1800),
      player("strong2", 1780),
      player("strong3", 1760),
      player("mid1", 1500),
      player("mid2", 1500),
      player("mid3", 1500),
      player("weak1", 1300),
      player("weak2", 1300),
      player("weak3", 1300),
      player("weak4", 1300),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({
        kind: "D" as const,
        a: rating(1500),
        b: rating(1500),
      })),
    };
    const result = optimizeLineup(roster, FORMAT_MIXED_5D, opponent, {
      topN: 5,
      includeExpectedWinsRanking: true,
    });
    expect(result.byExpectedWins).toBeDefined();
    // Sanity: both rankings produce valid lineups
    for (const l of result.byTeamWinProb)
      expect(l.assignments.length).toBe(FORMAT_MIXED_5D.courts.length);
    for (const l of result.byExpectedWins!)
      expect(l.assignments.length).toBe(FORMAT_MIXED_5D.courts.length);
  });

  it("Adult 18+ format mixes 2 singles + 3 doubles correctly", () => {
    const roster: RosterPlayer[] = [
      player("a", 1700),
      player("b", 1650),
      player("c", 1600),
      player("d", 1580),
      player("e", 1550),
      player("f", 1520),
      player("g", 1500),
      player("h", 1480),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_ADULT_18.courts.map((c) =>
        c.kind === "S"
          ? { kind: "S" as const, player: rating(1500) }
          : { kind: "D" as const, a: rating(1500), b: rating(1500) }
      ),
    };
    const result = optimizeLineup(roster, FORMAT_ADULT_18, opponent, {
      topN: 1,
    });
    const top = result.byTeamWinProb[0]!;
    expect(top.assignments.filter((a) => a.slot.kind === "S")).toHaveLength(2);
    expect(top.assignments.filter((a) => a.slot.kind === "D")).toHaveLength(3);
    // 2 singles use 1 player each, 3 doubles use 2 each = 8 unique players
    const allIds = top.assignments.flatMap((a) => a.ourPlayerIds);
    expect(new Set(allIds).size).toBe(8);
  });

  it("respects available=false", () => {
    const roster: RosterPlayer[] = [
      { ...player("a", 1700), available: false },
      player("b", 1650),
      player("c", 1600),
      player("d", 1580),
      player("e", 1550),
      player("f", 1520),
      player("g", 1500),
      player("h", 1480),
      player("i", 1460),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_MIXED_5D.courts.map(() => ({
        kind: "D" as const,
        a: rating(1500),
        b: rating(1500),
      })),
    };
    // 8 available, need 10. Should throw.
    expect(() =>
      optimizeLineup(roster, FORMAT_MIXED_5D, opponent, { topN: 1 })
    ).toThrow();
  });
});

describe("evaluateLineup", () => {
  it("evaluates a hand-picked lineup", () => {
    const roster: RosterPlayer[] = [
      player("a", 1700),
      player("b", 1650),
      player("c", 1600),
      player("d", 1580),
      player("e", 1550),
      player("f", 1520),
    ];
    const opponent: OpponentLineup = {
      courts: FORMAT_ADULT_18.courts.map((c) =>
        c.kind === "S"
          ? { kind: "S" as const, player: rating(1500) }
          : { kind: "D" as const, a: rating(1500), b: rating(1500) }
      ),
    };
    const lineup = evaluateLineup(
      roster,
      FORMAT_ADULT_18,
      opponent,
      [
        ["a"], // S1
        ["b"], // S2
        ["c", "d"], // D1
        ["e", "f"], // D2
        ["a", "b"], // D3 — note: reusing a/b is unusual but the function
        // doesn't enforce uniqueness; that's the optimizer's job
      ]
    );
    expect(lineup.assignments).toHaveLength(5);
    expect(lineup.teamWinProb).toBeGreaterThan(0.5);
  });
});

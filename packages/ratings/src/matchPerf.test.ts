import { describe, expect, it } from "vitest";
import { matchPerformance, DEFAULT_MATCH_PERF_CONFIG } from "./matchPerf.js";

describe("matchPerformance", () => {
  // Calibration anchors from the project owner:
  //   6-0, 6-0 ⇒ ≥0.5 NTRP gap   (anchor)
  //   6-1, 6-1 ⇒ 0.40–0.45 gap
  //   6-3, 6-3 ⇒ ~0.25 gap
  // Default config (matchWinBonus=0.15, gameMarginWeight=0.35) hits
  // all three within rounding.

  it("6-0, 6-0 win hits +0.5 ceiling (anchor)", () => {
    expect(
      matchPerformance({
        opponentRating: 3.0,
        matchWon: true,
        gamesWon: 12,
        gamesLost: 0,
      })
    ).toBeCloseTo(3.5, 6);
  });

  it("6-1, 6-1 win lands in the 0.40–0.45 band", () => {
    const perf = matchPerformance({
      opponentRating: 3.0,
      matchWon: true,
      gamesWon: 12,
      gamesLost: 2,
    });
    expect(perf).toBeGreaterThanOrEqual(3.38);
    expect(perf).toBeLessThanOrEqual(3.46);
  });

  it("6-3, 6-3 win lands near +0.25", () => {
    const perf = matchPerformance({
      opponentRating: 3.0,
      matchWon: true,
      gamesWon: 12,
      gamesLost: 6,
    });
    expect(perf).toBeGreaterThanOrEqual(3.22);
    expect(perf).toBeLessThanOrEqual(3.30);
  });

  it("0-6, 0-6 loss hits -0.5 floor (symmetric anchor)", () => {
    expect(
      matchPerformance({
        opponentRating: 4.0,
        matchWon: false,
        gamesWon: 0,
        gamesLost: 12,
      })
    ).toBeCloseTo(3.5, 6);
  });

  it("7-6, 7-6 close win still gets meaningful credit (>0.15)", () => {
    // The whole point of matchWinBonus: barely winning a match counts
    // for more than barely losing it, even though the game ratio is ~0.
    const won = matchPerformance({
      opponentRating: 3.5,
      matchWon: true,
      gamesWon: 14,
      gamesLost: 12,
    });
    const lost = matchPerformance({
      opponentRating: 3.5,
      matchWon: false,
      gamesWon: 12,
      gamesLost: 14,
    });
    expect(won).toBeGreaterThan(3.65); // >= 0.15 over opp
    expect(lost).toBeLessThan(3.35);   // <= -0.15 below opp
    expect(won - lost).toBeGreaterThanOrEqual(0.3); // 2 * matchWinBonus
  });

  it("retirement win: more games for the loser, winner still rated positive", () => {
    // Player won via opponent retirement after losing first set 3-6 and
    // leading 3-2 in the second. Games: 6 won, 8 lost. Without the win
    // bonus the perf would be NEGATIVE; with it, the winner stays above
    // opp because they technically won the match.
    const perf = matchPerformance({
      opponentRating: 3.5,
      matchWon: true,
      gamesWon: 6,
      gamesLost: 8,
    });
    expect(perf).toBeGreaterThan(3.5); // winner credited despite worse game count
  });

  it("zero-game match (defaulted, no play): match-win bonus still applied", () => {
    // Default-win: opp didn't show up. Winner gets matchWinBonus only.
    const perf = matchPerformance({
      opponentRating: 3.5,
      matchWon: true,
      gamesWon: 0,
      gamesLost: 0,
    });
    expect(perf).toBeCloseTo(3.5 + 0.15, 6);
  });

  it("default config splits 0.5 into 0.15 win-bonus + 0.35 game-margin", () => {
    expect(DEFAULT_MATCH_PERF_CONFIG.matchWinBonus).toBe(0.15);
    expect(DEFAULT_MATCH_PERF_CONFIG.gameMarginWeight).toBe(0.35);
  });

  it("respects custom config (e.g. game-only weighting)", () => {
    // Setting matchWinBonus=0 reduces this to the previous pure
    // game-margin model — useful for ablation studies.
    const perf = matchPerformance(
      {
        opponentRating: 3.0,
        matchWon: true,
        gamesWon: 12,
        gamesLost: 0,
      },
      { matchWinBonus: 0, gameMarginWeight: 0.5 }
    );
    expect(perf).toBeCloseTo(3.5, 6);
  });
});

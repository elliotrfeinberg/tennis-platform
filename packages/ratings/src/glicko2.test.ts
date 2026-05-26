import { describe, expect, it } from "vitest";
import {
  newRating,
  updateRating,
  winProbability,
  type Rating,
} from "./glicko2";

describe("Glicko-2", () => {
  it("matches Glickman (2012) worked example within tolerance", () => {
    // From section 7 of Glickman's Glicko-2 paper.
    // Player: rating 1500, RD 200, vol 0.06
    // 3 opponents: (1400, 30), (1550, 100), (1700, 300)
    // Results: W, L, L
    // Expected: rating ~1464.06, RD ~151.52, vol ~0.05999
    const player: Rating = { rating: 1500, rd: 200, vol: 0.06 };
    const result = updateRating(player, [
      { opponent: { rating: 1400, rd: 30, vol: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, vol: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, vol: 0.06 }, score: 0 },
    ]);
    expect(result.rating).toBeCloseTo(1464.06, 1);
    expect(result.rd).toBeCloseTo(151.52, 1);
    expect(result.vol).toBeCloseTo(0.05999, 4);
  });

  it("raises RD during an inactive period", () => {
    const player = newRating();
    const after = updateRating(player, []);
    expect(after.rating).toBe(player.rating);
    expect(after.rd).toBeGreaterThan(player.rd);
  });

  it("wins against weaker players raise rating", () => {
    const player = newRating();
    const weaker: Rating = { rating: 1200, rd: 50, vol: 0.06 };
    const after = updateRating(player, [
      { opponent: weaker, score: 1 },
      { opponent: weaker, score: 1 },
      { opponent: weaker, score: 1 },
    ]);
    expect(after.rating).toBeGreaterThan(player.rating);
    // RD should shrink — we have more info.
    expect(after.rd).toBeLessThan(player.rd);
  });

  it("losses to stronger players drop rating but bounded", () => {
    // High initial RD (350 for new player) -> Glicko legitimately moves a
    // lot on one match. Bound is generous to reflect "fast learner, not
    // crater" semantics.
    const player = newRating();
    const stronger: Rating = { rating: 1800, rd: 50, vol: 0.06 };
    const after = updateRating(player, [{ opponent: stronger, score: 0 }]);
    expect(after.rating).toBeLessThan(player.rating);
    expect(after.rating).toBeGreaterThan(player.rating - 150);
  });

  it("seasoned players (low RD) move much less per match", () => {
    const newbie = newRating();
    const seasoned: Rating = { rating: 1500, rd: 60, vol: 0.06 };
    const opp: Rating = { rating: 1500, rd: 60, vol: 0.06 };
    const newbieAfter = updateRating(newbie, [{ opponent: opp, score: 1 }]);
    const seasonedAfter = updateRating(seasoned, [{ opponent: opp, score: 1 }]);
    const newbieDelta = newbieAfter.rating - newbie.rating;
    const seasonedDelta = seasonedAfter.rating - seasoned.rating;
    expect(newbieDelta).toBeGreaterThan(seasonedDelta * 3);
  });

  it("winProbability is symmetric and bounded", () => {
    const a: Rating = { rating: 1600, rd: 50, vol: 0.06 };
    const b: Rating = { rating: 1400, rd: 50, vol: 0.06 };
    const p = winProbability(a, b);
    const q = winProbability(b, a);
    expect(p).toBeGreaterThan(0.5);
    expect(q).toBeLessThan(0.5);
    expect(p + q).toBeCloseTo(1, 1);
  });

  it("equal ratings give 50% win probability", () => {
    const a = newRating();
    const b = newRating();
    expect(winProbability(a, b)).toBeCloseTo(0.5, 5);
  });
});

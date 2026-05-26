import { describe, expect, it } from "vitest";
import { setScoreToOutcome, applySingles } from "./match.js";
import { newRating, type Rating } from "./glicko2.js";

describe("setScoreToOutcome", () => {
  it("6-0 win is decisive relative to 7-6", () => {
    const blowout = setScoreToOutcome({ player: 6, opponent: 0 });
    const tiebreak = setScoreToOutcome({ player: 7, opponent: 6 });
    expect(blowout).toBeGreaterThan(0.75);
    expect(blowout - tiebreak).toBeGreaterThan(0.15);
  });

  it("7-6 win is barely above 0.5", () => {
    const score = setScoreToOutcome({ player: 7, opponent: 6 });
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.6);
  });

  it("loss mirrors win", () => {
    const win = setScoreToOutcome({ player: 6, opponent: 2 });
    const loss = setScoreToOutcome({ player: 2, opponent: 6 });
    expect(win + loss).toBeCloseTo(1, 5);
  });

  it("game margin orders scores monotonically", () => {
    const scores = [
      setScoreToOutcome({ player: 7, opponent: 6 }),
      setScoreToOutcome({ player: 7, opponent: 5 }),
      setScoreToOutcome({ player: 6, opponent: 4 }),
      setScoreToOutcome({ player: 6, opponent: 3 }),
      setScoreToOutcome({ player: 6, opponent: 2 }),
      setScoreToOutcome({ player: 6, opponent: 1 }),
      setScoreToOutcome({ player: 6, opponent: 0 }),
    ];
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
  });
});

describe("applySingles", () => {
  it("rating moves toward winner after a 6-0, 6-0 thrashing", () => {
    const player = newRating();
    const opponent: Rating = { rating: 1500, rd: 80, vol: 0.06 };
    const after = applySingles(player, opponent, {
      sets: [
        { player: 6, opponent: 0 },
        { player: 6, opponent: 0 },
      ],
    });
    expect(after.rating).toBeGreaterThan(player.rating);
  });
});

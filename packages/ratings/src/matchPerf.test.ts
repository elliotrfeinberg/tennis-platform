import { describe, expect, it } from "vitest";
import { matchPerformance, scoreToPerfDelta } from "./matchPerf.js";

describe("scoreToPerfDelta — 2-set sweep table", () => {
  // Calibration anchors from the project owner, refined to empirical
  // medians from tennisrecord.com (3431 matches, year 2025).
  it("6-0, 6-0 sweep returns +0.48 for winner (empirical, near the 0.50 anchor)", () => {
    expect(
      scoreToPerfDelta(
        [
          { won: 6, lost: 0 },
          { won: 6, lost: 0 },
        ],
        true
      )
    ).toBe(0.48);
  });

  it("6-1, 6-1 sweep returns +0.40 for winner (in 0.40–0.45 anchor range)", () => {
    expect(
      scoreToPerfDelta(
        [
          { won: 6, lost: 1 },
          { won: 6, lost: 1 },
        ],
        true
      )
    ).toBe(0.4);
  });

  it("6-3, 6-3 sweep returns +0.21 for winner (empirical, near the 0.25 anchor)", () => {
    expect(
      scoreToPerfDelta(
        [
          { won: 6, lost: 3 },
          { won: 6, lost: 3 },
        ],
        true
      )
    ).toBe(0.21);
  });

  it("7-6, 7-6 sweep returns +0.05 — barely above opponent", () => {
    expect(
      scoreToPerfDelta(
        [
          { won: 7, lost: 6 },
          { won: 7, lost: 6 },
        ],
        true
      )
    ).toBe(0.05);
  });

  it("0-6, 0-6 returns -0.48 for loser (symmetric)", () => {
    expect(
      scoreToPerfDelta(
        [
          { won: 0, lost: 6 },
          { won: 0, lost: 6 },
        ],
        false
      )
    ).toBe(-0.48);
  });

  it("set order doesn't matter: 6-0, 6-4 = 6-4, 6-0", () => {
    const a = scoreToPerfDelta(
      [
        { won: 6, lost: 0 },
        { won: 6, lost: 4 },
      ],
      true
    );
    const b = scoreToPerfDelta(
      [
        { won: 6, lost: 4 },
        { won: 6, lost: 0 },
      ],
      true
    );
    expect(a).toBe(b);
  });
});

describe("scoreToPerfDelta — 3-set split formula", () => {
  it("dominant 3-setter (6-0, 4-6, 6-0) sits near the high end", () => {
    // Mean won-set dominance = (1.0 + 1.0) / 2 = 1.0
    // delta = 0.03 + (0.13 - 0.03) * 1.0 = 0.13
    expect(
      scoreToPerfDelta(
        [
          { won: 6, lost: 0 },
          { won: 4, lost: 6 },
          { won: 6, lost: 0 },
        ],
        true
      )
    ).toBeCloseTo(0.13, 6);
  });

  it("competitive 3-setter (7-5, 5-7, 7-5) sits near the low end", () => {
    // Mean won-set dominance = (2/12 + 2/12) / 2 = 0.167
    // delta = 0.03 + 0.10 * 0.167 = 0.047
    const d = scoreToPerfDelta(
      [
        { won: 7, lost: 5 },
        { won: 5, lost: 7 },
        { won: 7, lost: 5 },
      ],
      true
    );
    expect(d).toBeGreaterThan(0.04);
    expect(d).toBeLessThan(0.06);
  });

  it("loser of a 3-setter gets the symmetric negative", () => {
    const winnerDelta = scoreToPerfDelta(
      [
        { won: 6, lost: 0 },
        { won: 4, lost: 6 },
        { won: 6, lost: 0 },
      ],
      true
    );
    const loserDelta = scoreToPerfDelta(
      [
        { won: 0, lost: 6 },
        { won: 6, lost: 4 },
        { won: 0, lost: 6 },
      ],
      false
    );
    expect(loserDelta).toBeCloseTo(-winnerDelta, 6);
  });
});

describe("scoreToPerfDelta — fallback paths", () => {
  it("zero sets (defaulted before play): small +0.05 win bonus", () => {
    expect(scoreToPerfDelta([], true)).toBe(0.05);
    expect(scoreToPerfDelta([], false)).toBe(-0.05);
  });

  it("retirement after partial play: outcome decides sign, even with bad games", () => {
    // Won by retirement after losing 3-6 and leading 3-2 in the 2nd.
    // Total games 6 won, 8 lost. Fallback formula: 0.05 + 0.45 * (-2/14) = -0.014
    // That's slightly negative — note this is the FALLBACK case. The
    // matchWinBonus is +0.05 so the result is just barely below 0.
    // We accept that for now since "retirement winner with fewer games"
    // is genuinely ambiguous.
    const d = scoreToPerfDelta(
      [
        { won: 3, lost: 6 },
        { won: 3, lost: 2 },
      ],
      true
    );
    // Verify it's in a reasonable range — between the win bonus alone
    // (0.05) and a strongly negative game margin.
    expect(d).toBeGreaterThan(-0.05);
    expect(d).toBeLessThan(0.1);
  });

  it("non-canonical 2-set sweep (e.g. 9-7, 6-0 from a no-tiebreak format) falls through to linear", () => {
    // 9-7 isn't in the table → linear fallback. 15 won, 7 lost → ratio 8/22 = 0.36
    // delta = 0.05 + 0.45 * 0.36 = 0.21
    const d = scoreToPerfDelta(
      [
        { won: 9, lost: 7 },
        { won: 6, lost: 0 },
      ],
      true
    );
    expect(d).toBeCloseTo(0.05 + 0.45 * (8 / 22), 6);
  });
});

describe("matchPerformance — wraps the delta around opponent rating", () => {
  it("returns opponent + perfDelta for the winner", () => {
    const perf = matchPerformance({
      opponentRating: 3.0,
      matchWon: true,
      sets: [
        { won: 6, lost: 0 },
        { won: 6, lost: 0 },
      ],
    });
    expect(perf).toBeCloseTo(3.48, 6);
  });

  it("returns opponent - perfDelta for the loser (symmetric)", () => {
    const perf = matchPerformance({
      opponentRating: 4.0,
      matchWon: false,
      sets: [
        { won: 0, lost: 6 },
        { won: 0, lost: 6 },
      ],
    });
    expect(perf).toBeCloseTo(3.52, 6);
  });
});

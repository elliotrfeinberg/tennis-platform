// Win probability for a court (singles or doubles), computed directly from the
// NTRP rating DIFFERENCE between the two sides — no Glicko conversion.
//
//   P(us beat them) = 1 / (1 + 10^(-(us - them) / SCALE))
//
// SCALE sets how decisive a rating edge is. At the default (1.0): equal → 50%,
// a +0.5 NTRP edge → ~75%, +1.0 → ~90%. SCALE can be calibrated empirically
// from perf_match_results (each player's pre-match rating + the court outcome).
//
// Doubles: each side's rating is the partners' AVERAGE, minus a small stacking
// penalty on the partner gap (two 4.0s beat a 4.5+3.5 of the same mean).
// Court-order skill effects (line 1 vs 2 vs 3) are still ignored for v1.

export const DEFAULT_NTRP_SCALE = 1.0;

export function ntrpWinProb(us: number, them: number, scale = DEFAULT_NTRP_SCALE): number {
  return 1 / (1 + Math.pow(10, -(us - them) / scale));
}

export interface Doubles {
  a: number;
  b: number;
}

// Effective team NTRP: average of partners, penalized for skill gap.
export function teamNtrp(d: Doubles, stackingPenalty = 0.25): number {
  const gap = Math.abs(d.a - d.b);
  const penalty = Math.min(gap * stackingPenalty, 0.2);
  return (d.a + d.b) / 2 - penalty;
}

export function singlesWinProb(us: number, them: number, scale = DEFAULT_NTRP_SCALE): number {
  return ntrpWinProb(us, them, scale);
}

export function doublesWinProb(us: Doubles, them: Doubles, scale = DEFAULT_NTRP_SCALE): number {
  return ntrpWinProb(teamNtrp(us), teamNtrp(them), scale);
}

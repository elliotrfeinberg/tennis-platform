// Win probability for a court (singles or doubles), computed directly from the
// NTRP rating DIFFERENCE between the two sides — no Glicko conversion.
//
//   P(us beat them) = 1 / (1 + 10^(-(us - them) / SCALE))
//
// SCALE sets how decisive a rating edge is. It was CALIBRATED empirically by
// fitting this logistic against the historical rated courts (each side's
// pre-match perf rating + the court outcome), bucketed by court kind and using
// the per-KIND rating the optimizer actually applies (singles courts → singles
// rating, doubles courts → doubles rating; perf_match_results.kind_pre):
//
//   singles → 0.54   (a +0.5 NTRP edge ≈ 89%)   [14.3k courts]
//   doubles → 0.43   (a +0.5 NTRP edge ≈ 93%)   [47.6k courts]
//
// These are far more decisive than the old hand-set 1.0 (which implied +0.5 →
// 75% and made the optimizer badly under-confident). Doubles is slightly
// steeper than singles — team-average ratings predict outcomes a touch more
// sharply.
//
// Doubles: each side's rating is the partners' AVERAGE, minus a small stacking
// penalty on the partner gap (two 4.0s beat a 4.5+3.5 of the same mean).
// Court-order skill effects (line 1 vs 2 vs 3) are still ignored for v1.

// Empirically-fit per-kind scales (see header).
export const SINGLES_SCALE = 0.54;
export const DOUBLES_SCALE = 0.43;

// Legacy generic default, kept for `ntrpWinProb` callers that don't specify a
// kind. Prefer singlesWinProb / doublesWinProb, which default to the calibrated
// per-kind scales above.
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

export function singlesWinProb(us: number, them: number, scale = SINGLES_SCALE): number {
  return ntrpWinProb(us, them, scale);
}

// Effective-rating bonus applied to an ESTABLISHED doubles pair (partners who
// have played together enough to have real chemistry). Nudges the optimizer to
// keep proven pairings together; modest so it only sways genuinely close calls.
export const PARTNER_CHEMISTRY_BONUS = 0.07;

// Effective-rating adjustment for a player who mostly plays ONE discipline.
// A singles specialist gets +bonus at singles and −bonus at doubles (and vice
// versa), so the optimizer slots people into the discipline they actually play
// — and doesn't over-trust a specialist's thin rating in the other one.
export const DISCIPLINE_AFFINITY_BONUS = 0.1;

export function doublesWinProb(
  us: Doubles,
  them: Doubles,
  scale = DOUBLES_SCALE,
  chemBonus = 0
): number {
  return ntrpWinProb(teamNtrp(us) + chemBonus, teamNtrp(them), scale);
}

// Number of same-kind matches a player needs before their rating is fully
// trusted in a win-prob estimate. Below this we shrink the court probability
// toward a coin flip (see shrinkToFair) — a thin rating shouldn't produce a
// confident prediction.
export const CONFIDENCE_RAMP = 5;

// Pull a probability toward 0.5 by `confidence` ∈ [0,1]. confidence 1 leaves
// it untouched; 0 collapses it to a coin flip.
export function shrinkToFair(p: number, confidence: number): number {
  return 0.5 + confidence * (p - 0.5);
}

// Court confidence from the participants' same-kind match counts: governed by
// the LEAST-experienced participant (one unknown player makes the whole court
// a question mark). `undefined` counts are treated as fully known (the caller
// has no count to contribute) so this is a no-op when no counts are supplied.
export function courtConfidence(
  matchCounts: ReadonlyArray<number | undefined>,
  ramp = CONFIDENCE_RAMP
): number {
  const known = matchCounts.filter((c): c is number => typeof c === "number");
  if (known.length === 0) return 1;
  return Math.min(Math.min(...known) / ramp, 1);
}

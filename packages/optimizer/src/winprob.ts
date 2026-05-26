// Win probability for a court (singles or doubles).
//
// For singles we just delegate to Glicko's logistic via winProbability.
// For doubles we represent each side as the *average* of partner ratings,
// then take the win prob between the two averaged ratings.
//
// Two improvements I'm deliberately deferring:
//
// - Mixed-skill doubles ("stacking"): putting a 4.5 with a 3.5 is not the
//   same as two 4.0s, even though the average is identical. Modeling that
//   well needs a latent-skill / variance-aware approach. For v1 we add a
//   small penalty proportional to partner rating gap; revisit later.
//
// - Court order: lines 1/2/3 of doubles vs each other matter at higher
//   levels. We ignore court-order skill effects for now.

import { winProbability, type Rating } from "@tennis/ratings";

export interface Doubles {
  a: Rating;
  b: Rating;
}

function teamRating(d: Doubles, stackingPenalty = 0.25): Rating {
  const gap = Math.abs(d.a.rating - d.b.rating);
  // Penalty in rating points: 25% of the gap, capped at 60.
  const penalty = Math.min(gap * stackingPenalty, 60);
  return {
    rating: (d.a.rating + d.b.rating) / 2 - penalty,
    rd: Math.sqrt((d.a.rd ** 2 + d.b.rd ** 2) / 2),
    vol: (d.a.vol + d.b.vol) / 2,
  };
}

export function singlesWinProb(us: Rating, them: Rating): number {
  return winProbability(us, them);
}

export function doublesWinProb(us: Doubles, them: Doubles): number {
  return winProbability(teamRating(us), teamRating(them));
}

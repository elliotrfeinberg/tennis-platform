// Convert a tennis match score into Glicko outcomes.
//
// Two design choices worth flagging:
//
// 1. We score each set independently (with weight 1) rather than the whole
//    match as one outcome. A 6-0, 6-0 win is a much stronger signal than
//    7-5, 7-6, and per-set updates let Glicko see that naturally.
//
// 2. Set "score" isn't binary. A 6-0 set gives 1.0; a 7-6 gives 0.6
//    (logistic from games-won margin). Pure 0/1 would lose the difference
//    between a thrashing and a tiebreak, which is the most informative
//    signal we have.

import type { Outcome, Rating } from "./glicko2";
import { updateRating } from "./glicko2";

export interface SetScore {
  player: number;
  opponent: number;
}

export interface MatchResult {
  sets: readonly SetScore[];
}

// Map a single set's game margin to a [0, 1] outcome score for the winner's
// rating update. Loser's score is 1 - winner's.
// Approximate game-margin → outcome shape:
// 7-6 (m=1) -> 0.57
// 6-4 (m=2) -> 0.63
// 6-3 (m=3) -> 0.67
// 6-2 (m=4) -> 0.72
// 6-1 (m=5) -> 0.76
// 6-0 (m=6) -> 0.79
// Will retune from real labeled data once we backfill 2-3 years of tennislink.
export function setScoreToOutcome(set: SetScore): number {
  const total = set.player + set.opponent;
  if (total === 0) return 0.5;
  const winnerGames = Math.max(set.player, set.opponent);
  const loserGames = Math.min(set.player, set.opponent);
  const margin = winnerGames - loserGames;
  const winnerScore = 0.5 + 0.5 * (1 - Math.exp(-margin / 7));
  return set.player > set.opponent ? winnerScore : 1 - winnerScore;
}

// Singles match -> outcomes for one player.
export function singlesOutcomes(
  match: MatchResult,
  opponent: Rating
): Outcome[] {
  return match.sets.map((set) => ({
    opponent,
    score: setScoreToOutcome(set),
    weight: 1,
  }));
}

// Doubles match -> outcomes for one player. For Glicko we need a single
// opponent rating per outcome; we average the two opponents' ratings, and
// the partner contribution is reflected by the player's own rating being
// updated based on the *team's* result.
//
// This is the standard simplifying assumption used by Schmidt/TLA-style
// estimators. A more principled model would update partner ratings jointly
// (latent-skill model); we'll consider that for v2.
export function doublesOutcomes(
  match: MatchResult,
  opponentA: Rating,
  opponentB: Rating
): Outcome[] {
  const avg: Rating = {
    rating: (opponentA.rating + opponentB.rating) / 2,
    rd: Math.sqrt((opponentA.rd ** 2 + opponentB.rd ** 2) / 2),
    vol: (opponentA.vol + opponentB.vol) / 2,
  };
  return match.sets.map((set) => ({
    opponent: avg,
    score: setScoreToOutcome(set),
    weight: 1,
  }));
}

// Convenience: apply a singles match in one call.
export function applySingles(
  player: Rating,
  opponent: Rating,
  match: MatchResult
): Rating {
  return updateRating(player, singlesOutcomes(match, opponent));
}

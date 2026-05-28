// Per-match "performance rating" model — closer to USTA's published
// NTRP dynamic-rating approach than Glicko.
//
// For each completed match, the player's *performance rating* for that
// match is a function of (opponent's pre-match rating, game differential
// in this match). The player's *current rating* is then a weighted mean
// of their recent performance ratings.
//
// Key advantages over Glicko for this use case:
//
// 1. Output is on the NTRP scale by construction — no separate
//    calibration pass needed. Roster levels (3.0, 3.5, 4.0, ...) IS the
//    rating space.
// 2. Score margin matters. A 6-0, 6-0 sweep contributes a stronger
//    signal than a 7-6, 7-6 nailbiter.
// 3. Each match anchors against the opponent's actual rating, not a
//    shared 1500 prior — so disjoint clusters (e.g. a 3.0 subflight
//    and a 4.0 subflight that share no players) don't drift toward
//    each other's anchor.
//
// Calibration anchor (per project-owner spec): a 6-0, 6-0 result
// indicates at least a 0.5 NTRP level gap between the players. So the
// max single-match performance delta vs. opponent is 0.5 NTRP, hit at
// game-ratio = 1.0.

export interface MatchPerfConfig {
  // Bonus applied based on the match outcome regardless of margin. A
  // win adds +matchWinBonus; a loss adds -matchWinBonus. This ensures
  // a tiebreak win counts for SOMETHING beyond the near-zero game
  // ratio, and that retirement wins (where the loser may have won
  // more games before retiring) still score positive for the winner.
  matchWinBonus: number;
  // Per-unit-game-ratio weight. At ratio = ±1.0 (a 6-0, 6-0 sweep
  // either way), this contributes ±gameMarginWeight.
  gameMarginWeight: number;
  // Convenience: matchWinBonus + gameMarginWeight is the total max
  // delta vs. opponent. Default is 0.15 + 0.35 = 0.50, matching the
  // calibration anchor: 6-0, 6-0 ⇒ ≥0.5 NTRP gap.
}

export const DEFAULT_MATCH_PERF_CONFIG: MatchPerfConfig = {
  matchWinBonus: 0.15,
  gameMarginWeight: 0.35,
};

export interface MatchPerfInput {
  opponentRating: number;
  // Did this player's side win the match? Required separately from
  // game count because outcome can diverge from game-margin in retired
  // / defaulted matches (you can win by retirement after losing more
  // games), and because winning a match inherently signals more skill
  // than barely losing it, independent of the score margin.
  matchWon: boolean;
  // Games won by this player's side, summed across all sets played.
  gamesWon: number;
  // Games won by the opponent's side, summed across all sets played.
  gamesLost: number;
}

// Compute a player's performance rating for a single match, in NTRP
// units.
//
//   perf = opp + matchWinBonus * sign(matchWon) + gameMarginWeight * ratio
//
// where ratio = (gamesWon - gamesLost) / total_games, clipped to ±1.
//
// Examples (default config, opponent at 3.0):
//   6-0, 6-0 W: 3.0 + 0.15 + 0.35*1.00 = 3.50  (calibration anchor)
//   6-3, 6-3 W: 3.0 + 0.15 + 0.35*0.33 = 3.27
//   7-6, 7-6 W: 3.0 + 0.15 + 0.35*0.04 = 3.16  (close win still > 3.0)
//   6-7, 6-7 L: 3.0 - 0.15 - 0.35*0.04 = 2.84  (close loss still < 3.0)
//   0-6, 0-6 L: 3.0 - 0.15 - 0.35*1.00 = 2.50  (calibration anchor)
//
// Retired/defaulted matches: the winner can have fewer total games
// (e.g. lost first set, won 2nd 3-2 before opponent retired). The
// matchWinBonus ensures the retirement-winner still gets a positive
// delta; the game-margin term may be negative but never enough to flip
// the sign for normal retirement scenarios.
export function matchPerformance(
  input: MatchPerfInput,
  cfg: MatchPerfConfig = DEFAULT_MATCH_PERF_CONFIG
): number {
  const { opponentRating, matchWon, gamesWon, gamesLost } = input;
  const total = gamesWon + gamesLost;
  const ratio = total > 0 ? (gamesWon - gamesLost) / total : 0;
  const sign = matchWon ? 1 : -1;
  return (
    opponentRating + cfg.matchWinBonus * sign + cfg.gameMarginWeight * ratio
  );
}

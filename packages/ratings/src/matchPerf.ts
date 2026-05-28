// Per-match performance-rating model on the NTRP scale.
//
// For each completed match, the player's *performance rating* is:
//
//   perf = opp + scoreToPerfDelta(sets, won)
//
// where scoreToPerfDelta() maps a set-score pattern to a signed NTRP
// offset. The player's *current rating* is a weighted mean of their
// recent per-match perf ratings (computed elsewhere).
//
// Why a lookup table, not a continuous curve:
// 1. Tennis scores aren't continuous — they're a small set of canonical
//    patterns (6-0 through 7-6 per set). A table fits the natural shape.
// 2. The mapping isn't monotone in any single metric. A 7-5, 7-5 win
//    "feels" closer than a 6-4, 6-4 win even though game-margin is
//    larger; a 3-set win with a lost set "feels" closer than the won
//    sets' margin would suggest.
// 3. USTA's actual NTRP table is almost certainly discrete internally;
//    matching that shape lets us reverse-engineer cell values later
//    from sources like tennisrecord.com without changing the API.
//
// Calibration anchors from the project owner:
//   6-0, 6-0  ⇒  ≥0.5 NTRP gap   (the floor of a bagel sweep)
//   6-1, 6-1  ⇒  0.40–0.45 gap
//   6-3, 6-3  ⇒  ~0.25 gap
//
// Loser delta is symmetric (-perfDelta).

export interface PerfSetScore {
  // Games won by this player's side in this set.
  won: number;
  // Games won by the opponent's side in this set.
  lost: number;
}

export interface MatchPerfInput {
  opponentRating: number;
  matchWon: boolean;
  sets: PerfSetScore[];
}

export function matchPerformance(input: MatchPerfInput): number {
  const delta = scoreToPerfDelta(input.sets, input.matchWon);
  return input.opponentRating + delta;
}

// Mapping from a 2-set sweep (no set lost by the winner) to the
// winner's NTRP-rating offset vs. the opponent. Keys are the canonical
// sorted-ascending string "AwAl,BwBl" where Aw≤Bw and within ties Al≤Bl.
// Loser side gets the negative of this value.
//
// Hand-tuned to match the three calibration anchors plus typical USTA
// rating-delta conventions; refine cells as we observe real tennisrecord
// dynamic-match-ratings.
const TWO_SET_SWEEP_TABLE: Record<string, number> = {
  "6-0,6-0": 0.5,
  "6-0,6-1": 0.45,
  "6-0,6-2": 0.4,
  "6-0,6-3": 0.37,
  "6-0,6-4": 0.34,
  "6-0,7-5": 0.32,
  "6-0,7-6": 0.3,
  "6-1,6-1": 0.42,
  "6-1,6-2": 0.37,
  "6-1,6-3": 0.32,
  "6-1,6-4": 0.28,
  "6-1,7-5": 0.26,
  "6-1,7-6": 0.24,
  "6-2,6-2": 0.32,
  "6-2,6-3": 0.27,
  "6-2,6-4": 0.23,
  "6-2,7-5": 0.2,
  "6-2,7-6": 0.18,
  "6-3,6-3": 0.25,
  "6-3,6-4": 0.21,
  "6-3,7-5": 0.18,
  "6-3,7-6": 0.15,
  "6-4,6-4": 0.15,
  "6-4,7-5": 0.13,
  "6-4,7-6": 0.1,
  "7-5,7-5": 0.1,
  "7-5,7-6": 0.07,
  "7-6,7-6": 0.05,
};

// 3-set wins (split sets): losing a set inherently signals the
// players were close in level. We cap the delta low and let the
// winning-set margins drive a small variation.
//
// delta = MIN_3SET + (MAX_3SET - MIN_3SET) * mean_won_set_dominance
//
//   MIN_3SET = 0.03, MAX_3SET = 0.13
//   dominance(set) = max(0, (won - lost) / (won + lost))
//
// A "barely won 3-setter" (7-5, 4-6, 7-5): mean dom ≈ 0.17 → ~0.05
// A "dominant 3-setter" (6-0, 4-6, 6-0):   mean dom ≈ 1.00 → ~0.13
const MIN_3SET = 0.03;
const MAX_3SET = 0.13;

// Fallback for scores not covered above (e.g., partial-set retirements,
// 10-point match tiebreaks recorded as "10-7" sets, etc.). Returns the
// WINNER's delta; caller negates for loser side. Inputs are already
// flipped to winner's perspective.
//
// Linear game-margin + small win bonus. Pure win-by-default (no play)
// produces +0.05.
function linearFallbackWinnerDelta(winnerSets: PerfSetScore[]): number {
  let gw = 0;
  let gl = 0;
  for (const s of winnerSets) {
    gw += s.won;
    gl += s.lost;
  }
  const total = gw + gl;
  if (total === 0) return 0.05;
  const ratio = (gw - gl) / total;
  // 0.05 winner-bonus + 0.45 * ratio, then floored at +0.02. The floor
  // enforces "winning the match is positive signal" — a retirement win
  // with worse game count would otherwise net negative, putting the
  // loser above the winner in NTRP space. We accept that the perf
  // delta is tiny in that case (0.02), reflecting how soft the win was.
  return Math.max(0.02, 0.05 + 0.45 * ratio);
}

// Public score → NTRP delta. Always computes from winner's perspective
// then negates for the loser. This guarantees symmetry: |winner_delta|
// == |loser_delta|, so the winner is always rated above the loser
// regardless of game count.
export function scoreToPerfDelta(
  sets: PerfSetScore[],
  matchWon: boolean
): number {
  // Re-cast sets to the WINNER's perspective. If matchWon=false, the
  // caller's sets are from the loser's side; flip (won, lost).
  const winnerSets: PerfSetScore[] = matchWon
    ? sets
    : sets.map((s) => ({ won: s.lost, lost: s.won }));

  // Count sets the winner actually won.
  let setsWonByWinner = 0;
  for (const s of winnerSets) {
    if (s.won > s.lost) setsWonByWinner += 1;
  }

  let winnerDelta: number;

  if (winnerSets.length === 2 && setsWonByWinner === 2) {
    const key = canonicalSweepKey(winnerSets);
    const fromTable = TWO_SET_SWEEP_TABLE[key];
    if (fromTable !== undefined) {
      winnerDelta = fromTable;
    } else {
      winnerDelta = linearFallbackWinnerDelta(winnerSets);
    }
  } else if (winnerSets.length === 3 && setsWonByWinner === 2) {
    // Split-set 3-setter. Average dominance across the two won sets.
    let dom = 0;
    let n = 0;
    for (const s of winnerSets) {
      if (s.won <= s.lost) continue;
      const total = s.won + s.lost;
      dom += total > 0 ? (s.won - s.lost) / total : 0;
      n += 1;
    }
    const meanDom = n > 0 ? dom / n : 0;
    winnerDelta = MIN_3SET + (MAX_3SET - MIN_3SET) * meanDom;
  } else {
    // Any other shape — fall back to linear (winner-perspective).
    winnerDelta = linearFallbackWinnerDelta(winnerSets);
  }

  return matchWon ? winnerDelta : -winnerDelta;
}

// Build the canonical "Aw-Al,Bw-Bl" key with sets sorted ascending by
// games-won (ties broken by games-lost). Always from the winner's
// perspective; caller has already flipped for losing side.
function canonicalSweepKey(sets: PerfSetScore[]): string {
  const sorted = [...sets].sort((a, b) => {
    if (a.won !== b.won) return a.won - b.won;
    return a.lost - b.lost;
  });
  return sorted.map((s) => `${s.won}-${s.lost}`).join(",");
}

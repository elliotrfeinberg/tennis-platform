// USTA-style per-match performance-rating driver.
//
// Parallel to computeRatings (Glicko-2). Differences:
//
// - Output is on the NTRP scale by construction — no calibration step.
// - Score margin matters: each match uses summed games per side.
// - Cold-start uses the roster NTRP label as the initial rating; cluster
//   anchoring is preserved without a 1500 prior.
// - Each match anchors the player's perf rating against the opponent's
//   current rating, so disjoint clusters don't drift toward each other.
//
// Per-player state is the chronologically-ordered list of per-match
// performance ratings. The CURRENT rating reported back to the caller is
// a weighted mean of that list (recent matches weighted more, by default
// equally over a fixed window).
//
// Doubles: side rating = mean of the two partners' current ratings, same
// as Glicko. Both partners get the same per-match perf rating (their
// side's collective performance).

import {
  matchPerformance,
  DEFAULT_MATCH_PERF_CONFIG,
  type MatchPerfConfig,
} from "@tennis/ratings";
import type { CapturesData, PlayerLabel } from "./loadCaptures.js";

export interface PerfMatchEntry {
  // Match date (the chronological key) and the per-match perf rating
  // this player earned in that match. Listed in chronological order.
  date: Date;
  perf: number;
  // The opponent-side mean rating used as the anchor for this match.
  // Useful for diagnostics / hover-state in a UI.
  opponentRating: number;
  // Game differential (+ if won, − if lost). Useful for diagnostics.
  gamesDiff: number;
}

export interface PerfRatingsResult {
  // Final rating per player (weighted mean of their match history).
  ratings: Map<string, number>;
  // Match-by-match history per player. Same length as matchCount.
  history: Map<string, PerfMatchEntry[]>;
  // Matches we skipped (no winner inferable, or no game scores).
  skipped: number;
}

export interface ComputePerfRatingsOptions {
  // Cold-start rating for a player who has no matches yet. Default:
  // their roster NTRP label, falling back to 3.5 if unlabeled.
  initialRating?: (p: PlayerLabel) => number;
  // Weight for the perf rating at history-index k counting BACK from
  // the most recent (k=0 is the latest match). Default: equal weight
  // for the last 10 matches, zero before that.
  weightFn?: (kFromEnd: number) => number;
  // Tuning for the per-match perf curve. Default uses the calibrated
  // maxDelta=0.5 (6-0, 6-0 ⇒ +0.5 NTRP vs opponent).
  cfg?: Partial<MatchPerfConfig>;
}

// Equal weighting of the last 10 matches, no weight before. A typical
// USTA league season has ~15 matches per player; 10 is enough for the
// current-form signal to dominate while still smoothing single bad days.
const DEFAULT_WEIGHT_FN = (k: number): number => (k < 10 ? 1 : 0);

export function computePerfRatings(
  captures: CapturesData,
  opts: ComputePerfRatingsOptions = {}
): PerfRatingsResult {
  const cfg = { ...DEFAULT_MATCH_PERF_CONFIG, ...(opts.cfg ?? {}) };
  const initialRatingFn =
    opts.initialRating ?? ((p: PlayerLabel) => p.ntrp ?? 3.5);
  const weightFn = opts.weightFn ?? DEFAULT_WEIGHT_FN;

  // Per-player chronological match history.
  const history = new Map<string, PerfMatchEntry[]>();
  let skipped = 0;

  // Current-rating snapshot used during the chronological pass. We
  // re-derive it from history after each match for the players who just
  // played. For unplayed-yet players, we lazily seed from the initial
  // rating on first read.
  const currentRating = new Map<string, number>();
  const lookupInitial = (key: string): number => {
    const cached = currentRating.get(key);
    if (cached !== undefined) return cached;
    const p = captures.players.get(key);
    const init = p ? initialRatingFn(p) : 3.5;
    currentRating.set(key, init);
    return init;
  };

  // Weighted-mean current rating from a chronological history. The
  // most-recent entry is k=0 from the end.
  const computeCurrent = (entries: PerfMatchEntry[], fallback: number): number => {
    if (entries.length === 0) return fallback;
    let num = 0;
    let den = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const kFromEnd = entries.length - 1 - i;
      const w = weightFn(kFromEnd);
      if (w <= 0) continue;
      num += w * entries[i]!.perf;
      den += w;
    }
    return den > 0 ? num / den : fallback;
  };

  for (const m of captures.matches) {
    if (m.homeWon === undefined) {
      skipped += 1;
      continue;
    }
    if (m.homePlayerKeys.length === 0 || m.visitorPlayerKeys.length === 0) {
      skipped += 1;
      continue;
    }
    const homePre = m.homePlayerKeys.map(lookupInitial);
    const visitorPre = m.visitorPlayerKeys.map(lookupInitial);
    const homeMean = mean(homePre);
    const visitorMean = mean(visitorPre);

    // When set scores are missing (e.g. defaulted before play), fall
    // back to a 12-0 proxy on the winner's side so the model doesn't
    // silently understate a forfeit. CourtMatch.gamesHome/Visitor come
    // from loadCaptures summing across sets.
    const gamesHome =
      m.gamesHome !== undefined ? m.gamesHome : m.homeWon ? 12 : 0;
    const gamesVisitor =
      m.gamesVisitor !== undefined ? m.gamesVisitor : m.homeWon ? 0 : 12;

    const homePerf = matchPerformance(
      {
        opponentRating: visitorMean,
        matchWon: m.homeWon,
        gamesWon: gamesHome,
        gamesLost: gamesVisitor,
      },
      cfg
    );
    const visitorPerf = matchPerformance(
      {
        opponentRating: homeMean,
        matchWon: !m.homeWon,
        gamesWon: gamesVisitor,
        gamesLost: gamesHome,
      },
      cfg
    );

    // Append to each player's history, then re-snapshot their current
    // rating for use by later matches.
    for (const key of m.homePlayerKeys) {
      const entries = history.get(key) ?? [];
      entries.push({
        date: m.date,
        perf: homePerf,
        opponentRating: visitorMean,
        gamesDiff: gamesHome - gamesVisitor,
      });
      history.set(key, entries);
      currentRating.set(key, computeCurrent(entries, lookupInitial(key)));
    }
    for (const key of m.visitorPlayerKeys) {
      const entries = history.get(key) ?? [];
      entries.push({
        date: m.date,
        perf: visitorPerf,
        opponentRating: homeMean,
        gamesDiff: gamesVisitor - gamesHome,
      });
      history.set(key, entries);
      currentRating.set(key, computeCurrent(entries, lookupInitial(key)));
    }
  }

  // Final ratings: weighted mean of each player's full history (or the
  // initial rating if they never played).
  const finalRatings = new Map<string, number>();
  for (const [key, entries] of history) {
    finalRatings.set(key, computeCurrent(entries, lookupInitial(key)));
  }

  return {
    ratings: finalRatings,
    history,
    skipped,
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

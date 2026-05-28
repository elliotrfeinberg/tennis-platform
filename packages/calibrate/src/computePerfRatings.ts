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

import { matchPerformance, type PerfSetScore } from "@tennis/ratings";
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
}

// Equal weighting of the last 10 matches, no weight before. A typical
// USTA league season has ~15 matches per player; 10 is enough for the
// current-form signal to dominate while still smoothing single bad days.
const DEFAULT_WEIGHT_FN = (k: number): number => (k < 10 ? 1 : 0);

export function computePerfRatings(
  captures: CapturesData,
  opts: ComputePerfRatingsOptions = {}
): PerfRatingsResult {
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

    // Build per-set scores from the home side's perspective. When sets
    // are empty (default before any play), pass an empty array — the
    // perf model handles that via its fallback (small win bonus).
    const homeSets: PerfSetScore[] = m.sets.map((s) => ({
      won: s.home,
      lost: s.visitor,
    }));
    const visitorSets: PerfSetScore[] = m.sets.map((s) => ({
      won: s.visitor,
      lost: s.home,
    }));

    const homePerf = matchPerformance({
      opponentRating: visitorMean,
      matchWon: m.homeWon,
      sets: homeSets,
    });
    const visitorPerf = matchPerformance({
      opponentRating: homeMean,
      matchWon: !m.homeWon,
      sets: visitorSets,
    });

    // Pre-compute game-diff for diagnostics in history entries.
    let gh = 0;
    let gv = 0;
    for (const s of m.sets) {
      gh += s.home;
      gv += s.visitor;
    }
    const gamesHome = gh;
    const gamesVisitor = gv;

    // Doubles attribution: each partner's individual match rating is
    // not simply the team perf. USTA's published DMR data (verified
    // empirically from tennisrecord) preserves the partners' pre-match
    // rating spread exactly:
    //
    //   partner_perf = team_perf + (partner_pre − team_mean_pre)
    //
    // So if A and B come in at 3.27 and 3.75 (mean 3.51) and the team
    // performs at 3.41, A's match rating is 3.41 + (3.27 − 3.51) = 3.17
    // and B's is 3.41 + (3.75 − 3.51) = 3.65 — exact match to USTA's
    // numbers.
    //
    // Singles is the trivial case (one player, spread = 0).
    //
    // Append to each player's history, then re-snapshot their current
    // rating for use by later matches.
    for (let i = 0; i < m.homePlayerKeys.length; i++) {
      const key = m.homePlayerKeys[i]!;
      const partnerPre = homePre[i]!;
      const individualPerf = homePerf + (partnerPre - homeMean);
      const entries = history.get(key) ?? [];
      entries.push({
        date: m.date,
        perf: individualPerf,
        opponentRating: visitorMean,
        gamesDiff: gamesHome - gamesVisitor,
      });
      history.set(key, entries);
      currentRating.set(key, computeCurrent(entries, lookupInitial(key)));
    }
    for (let i = 0; i < m.visitorPlayerKeys.length; i++) {
      const key = m.visitorPlayerKeys[i]!;
      const partnerPre = visitorPre[i]!;
      const individualPerf = visitorPerf + (partnerPre - visitorMean);
      const entries = history.get(key) ?? [];
      entries.push({
        date: m.date,
        perf: individualPerf,
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

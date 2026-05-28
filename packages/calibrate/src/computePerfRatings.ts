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

export interface PerfMatchPlayerRef {
  key: string;
  name: string;
  // This player/opponent/partner's rolling rating going INTO this match.
  preRating: number;
}

export interface PerfMatchEntry {
  matchId: string;
  // Match date (the chronological key) and the per-match perf rating
  // this player earned in that match. Listed in chronological order.
  date: Date;
  // Player's individual match rating for this match.
  perf: number;
  // Team-level match rating (same as perf for singles; for doubles, the
  // mean of the two partners' individual perfs).
  teamPerf: number;
  // The player's rolling rating going INTO this match.
  playerPreRating: number;
  // The player's rolling rating AFTER this match (weighted mean of
  // history up to and including this entry). Drives the UI sparkline.
  playerPostRating: number;

  // Mean of opponents' pre-match ratings (the anchor for team perf).
  opponentRating: number;
  // Game differential (+ if won, − if lost). Useful for diagnostics.
  gamesDiff: number;

  // Opponents on the other side, with their pre-match ratings.
  opponents: PerfMatchPlayerRef[];
  // Doubles partner(s) on the same side, with their pre-match ratings.
  // Empty for singles.
  partners: PerfMatchPlayerRef[];

  // Per-set scores from THIS PLAYER's perspective. Empty if no sets
  // were played (default/forfeit).
  sets: Array<{ playerGames: number; opponentGames: number }>;
  // Whether this player's side won the match.
  won: boolean;

  // Team / opponent-team name strings from the scorecard (for the UI).
  // Always the player's own team name first.
  playerTeamName: string;
  opponentTeamName: string;
  // Line + kind (S/D) of the court.
  line: number;
  kind: "S" | "D";
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

// NTRP bands are continuous half-open ranges:
//   3.0 band = (2.5001, 3.0000]  → midpoint 2.75
//   3.5 band = (3.0001, 3.5000]  → midpoint 3.25
//   4.0 band = (3.5001, 4.0000]  → midpoint 3.75
// So the published band label (3.5) is the UPPER edge of the range,
// not the typical true rating of players in the band. The expected
// continuous rating for a typical player at band N is (N - 0.25).
export function ntrpBandMidpoint(label: number): number {
  return label - 0.25;
}

export function computePerfRatings(
  captures: CapturesData,
  opts: ComputePerfRatingsOptions = {}
): PerfRatingsResult {
  // Default cold-start: each labeled player begins at their NTRP band's
  // MIDPOINT (label - 0.25), not the label itself. Initializing at the
  // label inflated all ratings by ~0.25 in earlier runs.
  const initialRatingFn =
    opts.initialRating ??
    ((p: PlayerLabel) =>
      p.ntrp !== undefined ? ntrpBandMidpoint(p.ntrp) : 3.25);
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
    // Build PlayerRef arrays once per side so doubles partners' detail
    // appears in each other's history.
    const nameFor = (key: string): string =>
      captures.players.get(key)?.name ?? "(unknown)";
    const homeRefs: PerfMatchPlayerRef[] = m.homePlayerKeys.map((k, i) => ({
      key: k,
      name: nameFor(k),
      preRating: homePre[i]!,
    }));
    const visitorRefs: PerfMatchPlayerRef[] = m.visitorPlayerKeys.map(
      (k, i) => ({ key: k, name: nameFor(k), preRating: visitorPre[i]! })
    );

    // Append to each player's history, then re-snapshot their current
    // rating for use by later matches. The match entry carries the
    // player's pre-rating, their individual perf, and the post-rating
    // (= the weighted-mean rating after this match is folded in).
    const appendForSide = (
      sideKeys: string[],
      sidePre: number[],
      sideMean: number,
      sidePerf: number,
      sideRefs: PerfMatchPlayerRef[],
      oppRefs: PerfMatchPlayerRef[],
      oppMean: number,
      sideWon: boolean,
      // Side-relative score: (player_games, opp_games) per set.
      sideSetsSigned: Array<{ playerGames: number; opponentGames: number }>,
      sideGamesDiff: number,
      playerTeamName: string,
      opponentTeamName: string
    ) => {
      for (let i = 0; i < sideKeys.length; i++) {
        const key = sideKeys[i]!;
        const partnerPre = sidePre[i]!;
        const individualPerf = sidePerf + (partnerPre - sideMean);
        const partners = sideRefs.filter((_, j) => j !== i);
        const entries = history.get(key) ?? [];
        // Provisional entry without post-rating; we patch it below
        // once we recompute the new rolling mean.
        const entry: PerfMatchEntry = {
          matchId: m.matchId,
          date: m.date,
          perf: individualPerf,
          teamPerf: sidePerf,
          playerPreRating: partnerPre,
          playerPostRating: 0, // patched right after we re-mean
          opponentRating: oppMean,
          gamesDiff: sideGamesDiff,
          opponents: oppRefs,
          partners,
          sets: sideSetsSigned,
          won: sideWon,
          playerTeamName,
          opponentTeamName,
          line: m.line,
          kind: m.kind,
        };
        entries.push(entry);
        history.set(key, entries);
        const newCurrent = computeCurrent(entries, lookupInitial(key));
        entry.playerPostRating = newCurrent;
        currentRating.set(key, newCurrent);
      }
    };

    const homeSetsSigned = m.sets.map((s) => ({
      playerGames: s.home,
      opponentGames: s.visitor,
    }));
    const visitorSetsSigned = m.sets.map((s) => ({
      playerGames: s.visitor,
      opponentGames: s.home,
    }));

    appendForSide(
      m.homePlayerKeys,
      homePre,
      homeMean,
      homePerf,
      homeRefs,
      visitorRefs,
      visitorMean,
      m.homeWon,
      homeSetsSigned,
      gamesHome - gamesVisitor,
      m.homeTeamName,
      m.visitorTeamName
    );
    appendForSide(
      m.visitorPlayerKeys,
      visitorPre,
      visitorMean,
      visitorPerf,
      visitorRefs,
      homeRefs,
      homeMean,
      !m.homeWon,
      visitorSetsSigned,
      gamesVisitor - gamesHome,
      m.visitorTeamName,
      m.homeTeamName
    );
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

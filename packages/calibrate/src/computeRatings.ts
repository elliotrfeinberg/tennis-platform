// Chronological Glicko-2 pass over a subflight's match history.
//
// Model decision (per the architecture choice on file): for doubles
// courts, we treat each side as having a single combined rating (mean
// of its players) for the purpose of the opponent in the update step,
// and we attribute the win/loss equally to each player on the winning/
// losing side. This is the simplest reasonable model for league play
// and matches how most rec-tennis ranking systems handle doubles.
//
// Per-match updates (not per-rating-period) — Glickman notes this is
// equivalent up to small reordering effects when match volume per
// player is low (true for league play: ~15 matches per player per
// season).
//
// Courts with an undefined winner (no mark.gif on either side, rare)
// are skipped. Retired/defaulted courts are handled by the underlying
// scorecard parser, which already reflects them in `homeWon`.

import {
  DEFAULT_CONFIG,
  newRating,
  updateRating,
  type Glicko2Config,
  type Rating,
} from "@tennis/ratings";
import type { CapturesData, CourtMatch } from "./loadCaptures.js";

export interface ComputeRatingsResult {
  ratings: Map<string, Rating>;
  // How many matches contributed to each player's rating — useful for
  // weighting downstream fits (low-match-count players are noisier).
  matchCounts: Map<string, number>;
  // Matches we skipped (no winner inferable). Returned so the caller
  // can surface coverage stats.
  skipped: number;
}

export function computeRatings(
  captures: CapturesData,
  config: Partial<Glicko2Config> = {}
): ComputeRatingsResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ratings = new Map<string, Rating>();
  const counts = new Map<string, number>();
  let skipped = 0;

  const get = (key: string): Rating => ratings.get(key) ?? newRating(cfg);
  const bumpCount = (key: string) =>
    counts.set(key, (counts.get(key) ?? 0) + 1);

  for (const m of captures.matches) {
    if (m.homeWon === undefined) {
      skipped += 1;
      continue;
    }
    if (m.homePlayerKeys.length === 0 || m.visitorPlayerKeys.length === 0) {
      skipped += 1;
      continue;
    }

    // Capture pre-update ratings so doubles partners are both compared
    // against the same opponent-side mean. Otherwise the second player
    // would see an already-updated team mean.
    const homePre = m.homePlayerKeys.map(get);
    const visitorPre = m.visitorPlayerKeys.map(get);
    const homeMean = meanRating(homePre);
    const visitorMean = meanRating(visitorPre);

    for (let i = 0; i < m.homePlayerKeys.length; i++) {
      const key = m.homePlayerKeys[i]!;
      const updated = updateRating(
        homePre[i]!,
        [{ opponent: visitorMean, score: m.homeWon ? 1 : 0 }],
        cfg
      );
      ratings.set(key, updated);
      bumpCount(key);
    }
    for (let i = 0; i < m.visitorPlayerKeys.length; i++) {
      const key = m.visitorPlayerKeys[i]!;
      const updated = updateRating(
        visitorPre[i]!,
        [{ opponent: homeMean, score: m.homeWon ? 0 : 1 }],
        cfg
      );
      ratings.set(key, updated);
      bumpCount(key);
    }
  }

  return { ratings, matchCounts: counts, skipped };
}

// Mean rating + RD across N players on one side of a doubles (or
// singles) court. The averaged RD reflects how uncertain we are about
// the combined side, which is what Glicko's update step needs to know
// when scaling its adjustment.
function meanRating(ratings: Rating[]): Rating {
  if (ratings.length === 1) return ratings[0]!;
  let r = 0;
  let rd = 0;
  let vol = 0;
  for (const x of ratings) {
    r += x.rating;
    rd += x.rd;
    vol += x.vol;
  }
  const n = ratings.length;
  return { rating: r / n, rd: rd / n, vol: vol / n };
}

// Helper for the CLI / downstream: extract (glicko, ntrp) labels for
// the players we have NTRP labels for and that played enough matches
// to have a converged-ish rating. Returns rows in (key, name, rating,
// rd, ntrp, matches) form so callers can dump them or feed to
// fitCalibration.
export interface LabeledRatingRow {
  key: string;
  name: string;
  rating: number;
  rd: number;
  ntrp: number;
  matches: number;
  teams: string[];
}

export function labeledRows(
  captures: CapturesData,
  result: ComputeRatingsResult,
  opts: { minMatches?: number } = {}
): LabeledRatingRow[] {
  const minMatches = opts.minMatches ?? 3;
  const rows: LabeledRatingRow[] = [];
  for (const p of captures.players.values()) {
    if (p.ntrp === undefined) continue;
    const r = result.ratings.get(p.key);
    if (!r) continue;
    const matches = result.matchCounts.get(p.key) ?? 0;
    if (matches < minMatches) continue;
    rows.push({
      key: p.key,
      name: p.name,
      rating: r.rating,
      rd: r.rd,
      ntrp: p.ntrp,
      matches,
      teams: p.teams,
    });
  }
  return rows;
}

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
// Two parallel rating streams per player: `adult` (updated only by Adult
// matches) and `mixed` (updated only by Mixed matches). Combo / Tri-Level
// / Flexible matches don't update either stream but still appear in
// history with a shadow per-match perf computed against adult ?? mixed.
//
// Per-player state is the chronologically-ordered list of per-match
// performance ratings per stream. The CURRENT rating reported back to the
// caller is a weighted mean of that stream's history.
//
// Doubles: side rating = mean of the two partners' current ratings. The
// per-match team perf is a SYMMETRIC, zero-sum update (winner_team −
// loser_team == the score-table gap, both centered on the match midpoint),
// not the old "opponent + full delta" anchor. Individual attribution then
// moves every partner equally from their own pre-rating, preserving the
// partner spread. See the teamPerf computation below for the formula.

import { scoreToPerfDelta, type PerfSetScore } from "@tennis/ratings";
import type { CapturesData, PlayerLabel } from "./loadCaptures.js";
import { classifyLeague, type MatchCategory } from "./classifyLeague.js";

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
  // The player's rolling rating AFTER this match (weighted mean of the
  // relevant category history up to and including this entry). Drives
  // the UI sparkline for the display stream.
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

  // The player's rolling rating in the per-KIND stream (singles or doubles,
  // per this court's kind) going INTO this match. Only set for rating-affecting
  // matches. Persisted so the win-prob scales can be calibrated on the real
  // kind-specific ratings the optimizer actually uses.
  kindPreRating?: number;

  // Category of this match.
  category: MatchCategory;
  // Whether this match updated any rating stream (false for combo/other).
  affectsRating: boolean;
  // Which rating space was used to compute perf. For adult/combo/other
  // this is "adult" (unless the player has no adult rating, in which case
  // it falls back to "mixed").
  perfBasis: "adult" | "mixed";
}

// Per-player aggregate across both rating streams.
export interface PlayerPerfRatings {
  adult: number | undefined;
  mixed: number | undefined;
  // Convenience display: adult ?? mixed ?? undefined.
  display: number | undefined;
  adultMatches: number;
  mixedMatches: number;
  otherMatches: number;
  // Hidden per-court-kind streams used only by the lineup optimizer — NOT
  // shown on any main page. `singles` aggregates singles courts, `doubles`
  // aggregates doubles courts (adult + mixed blended), across the same
  // rating-affecting universe as adult/mixed. undefined when no matches in
  // that kind. A player good at one and weak at the other no longer has the
  // two averaged together.
  singles: number | undefined;
  doubles: number | undefined;
  singlesMatches: number;
  doublesMatches: number;
}

export interface PerfRatingsResult {
  // Per-player aggregate ratings (replaces old `ratings: Map<string, number>`).
  playerRatings: Map<string, PlayerPerfRatings>;
  // Back-compat alias: display rating per player (adult ?? mixed).
  ratings: Map<string, number>;
  // Unified chronological history per player (all categories; combo/other
  // entries have affectsRating=false).
  history: Map<string, PerfMatchEntry[]>;
  // Matches we skipped (no winner inferable, or no player keys).
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

// Confidence ramp: a player's rolling rating is only fully trusted as an
// anchor for OTHER players once they've played this many rating-affecting
// matches. Mirrors tennisrecord's ~3-match baseline. Self-rated players
// ("S") need more matches to settle, since their starting level is an
// unverified self-assessment. Until then their anchor is blended toward
// their band prior so a mis-rate doesn't contaminate everyone they play.
const ESTABLISHED_MATCHES = 3;
const SELF_RATE_MATCHES = 5;

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

// Clamp a rating into the half-open band for `label`: (label-0.5, label].
// Ratings already inside the band pass through unchanged; ratings below
// snap up to the band floor (label-0.5), ratings above snap down to the
// band ceiling (label). Used at year boundaries to keep a carried-over
// rating consistent with the player's new registered level. Returns the
// rating unchanged when the player has no band label.
export function clampToBand(rating: number, label: number | undefined): number {
  if (label === undefined) return rating;
  const floor = label - 0.5;
  if (rating < floor) return floor;
  if (rating > label) return label;
  return rating;
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

  // Per-player chronological history (all categories).
  const history = new Map<string, PerfMatchEntry[]>();
  // Per-category sub-histories used for rolling rating computation.
  const adultHistory = new Map<string, PerfMatchEntry[]>();
  const mixedHistory = new Map<string, PerfMatchEntry[]>();
  let skipped = 0;

  // Rolling-rating snapshots split by stream. Lazily seeded from the
  // initial rating function on first access.
  const adultRating = new Map<string, number>();
  const mixedRating = new Map<string, number>();

  // Last season year each player's stream has been advanced to. When a
  // match's seasonYear exceeds this, we cross a year boundary and carry
  // the rating over (clamped into the new band) before rating the match.
  const adultYear = new Map<string, number>();
  const mixedYear = new Map<string, number>();

  // Career-total count of rating-affecting matches per player per stream
  // (NOT reset at year boundaries — a returning player stays established).
  // Drives the confidence ramp: a provisional player's rating is trusted
  // less as an anchor for their opponents.
  const adultCount = new Map<string, number>();
  const mixedCount = new Map<string, number>();

  // Per-court-kind streams (hidden; optimizer-only). Parallel machinery to the
  // category streams, but partitioned by S vs D instead of adult vs mixed.
  // Updated only by rating-affecting (adult/mixed) matches, same as the
  // category streams. History entries here are lightweight — only the fields
  // computeCurrent reads (perf, playerPreRating, opponentRating).
  const singlesRating = new Map<string, number>();
  const doublesRating = new Map<string, number>();
  const singlesHistory = new Map<string, PerfMatchEntry[]>();
  const doublesHistory = new Map<string, PerfMatchEntry[]>();
  const singlesCount = new Map<string, number>();
  const doublesCount = new Map<string, number>();
  const singlesYear = new Map<string, number>();
  const doublesYear = new Map<string, number>();

  const coldStart = (key: string): number => {
    const p = captures.players.get(key);
    return p ? initialRatingFn(p) : 3.25;
  };

  // The player's registered band for a given season year, falling back
  // to their first-seen label when that year wasn't on a roster.
  const bandForYear = (key: string, year: number): number | undefined => {
    const p = captures.players.get(key);
    if (!p) return undefined;
    return p.ntrpByYear.get(year) ?? p.ntrp;
  };

  // Confidence in a player's rolling rating as an anchor for others, in
  // [0,1]. Ramps linearly with the number of rating-affecting matches
  // already played in the relevant stream, reaching 1 at the type's
  // threshold (more matches for self-rates).
  const anchorConfidence = (key: string, basis: "adult" | "mixed"): number => {
    const count =
      (basis === "adult" ? adultCount.get(key) : mixedCount.get(key)) ?? 0;
    const isSelfRate = captures.players.get(key)?.ratingType === "S";
    const threshold = isSelfRate ? SELF_RATE_MATCHES : ESTABLISHED_MATCHES;
    return Math.min(count / threshold, 1);
  };

  // The rating to use when this player ANCHORS an opponent's perf: their
  // rolling rating blended toward their band prior by confidence. A
  // brand-new player anchors entirely at their band prior; an established
  // one anchors at their full rolling rating. (Their OWN pre-rating and
  // the doubles spread always use the raw rolling rating — this blend is
  // only about how much their rating influences others.)
  const anchorRating = (key: string, basis: "adult" | "mixed"): number => {
    const rolling = lookupForBasis(key, basis);
    const c = anchorConfidence(key, basis);
    if (c >= 1) return rolling;
    return c * rolling + (1 - c) * coldStart(key);
  };

  // Lookup the current rating for a player in the given basis stream,
  // falling back across streams when no matches exist in that stream.
  const lookupForBasis = (key: string, basis: "adult" | "mixed"): number => {
    if (basis === "adult") {
      const a = adultRating.get(key);
      if (a !== undefined) return a;
      const m = mixedRating.get(key);
      if (m !== undefined) return m;
    } else {
      const m = mixedRating.get(key);
      if (m !== undefined) return m;
      const a = adultRating.get(key);
      if (a !== undefined) return a;
    }
    return coldStart(key);
  };

  // Closeness weight: a match between similar-level players is far more
  // informative than a lopsided one, so it counts more in the rolling mean.
  // Weight falls off as a Gaussian in the pre-match rating gap (σ = 0.6):
  // gap 0 → 1.0, 0.5 → 0.71, 1.0 → 0.25, 1.5 → 0.04. This also damps
  // "completely unexpected" results, which are by definition across a big gap.
  // The synthetic year-boundary seed (no pre/opp fields) counts at full weight.
  const CLOSENESS_SIGMA = 0.6;
  const closenessWeight = (e: PerfMatchEntry): number => {
    const pre = e.playerPreRating;
    const opp = e.opponentRating;
    if (typeof pre !== "number" || typeof opp !== "number") return 1;
    const gap = pre - opp;
    return Math.exp(-(gap * gap) / (2 * CLOSENESS_SIGMA * CLOSENESS_SIGMA));
  };

  // Weighted-mean current rating from a chronological category history.
  // The most-recent entry is k=0 from the end. Weight = recency × closeness.
  const computeCurrent = (entries: PerfMatchEntry[], fallback: number): number => {
    if (entries.length === 0) return fallback;
    let num = 0;
    let den = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const kFromEnd = entries.length - 1 - i;
      const w = weightFn(kFromEnd) * closenessWeight(entries[i]!);
      if (w <= 0) continue;
      num += w * entries[i]!.perf;
      den += w;
    }
    return den > 0 ? num / den : fallback;
  };

  // Shrink a rolling rating toward the player's band prior (cold-start
  // midpoint) while they have few rating-affecting matches, so one lucky or
  // unlucky early result can't define them. Fully trusts the rolling mean once
  // established (3 matches; 5 for self-rates), mirroring tennisrecord's
  // "unrated until 3, then average". Applied to the reported aggregate rating.
  const withPrior = (value: number, key: string, count: number): number => {
    const isSelfRate = captures.players.get(key)?.ratingType === "S";
    const threshold = isSelfRate ? SELF_RATE_MATCHES : ESTABLISHED_MATCHES;
    const c = Math.min(count / threshold, 1);
    return c >= 1 ? value : c * value + (1 - c) * coldStart(key);
  };

  // Cross a player's stream into `seasonYear`. On the first year-to-year
  // step we snapshot the prior year's rolling rating, clamp it into the
  // new year's band, and reseed the stream history with a single synthetic
  // carry-in entry (perf = clamped). That seed feeds the rolling mean for
  // the new year and ages out of the last-10 window after ~10 real
  // matches. The synthetic entry is NEVER pushed to the public `history`
  // map, so the match log and per-stream match counts stay accurate.
  // Generic year-boundary crossing for any one stream's (year, history,
  // rating) maps. On the first step into a later season, snapshot the prior
  // rolling rating, clamp it into the new band, and reseed history with a
  // single synthetic carry-in entry. Used by both the category and the
  // per-kind streams.
  const advanceStreamYear = (
    yearMap: Map<string, number>,
    histMap: Map<string, PerfMatchEntry[]>,
    ratingMap: Map<string, number>,
    key: string,
    seasonYear: number
  ): void => {
    const prev = yearMap.get(key);
    if (prev !== undefined && seasonYear > prev) {
      const entries = histMap.get(key) ?? [];
      const current = computeCurrent(entries, coldStart(key));
      const clamped = clampToBand(current, bandForYear(key, seasonYear));
      histMap.set(key, [{ perf: clamped } as PerfMatchEntry]);
      ratingMap.set(key, clamped);
    }
    yearMap.set(key, Math.max(prev ?? seasonYear, seasonYear));
  };

  const applyYearBoundary = (
    key: string,
    stream: "adult" | "mixed",
    seasonYear: number
  ): void => {
    const yearMap = stream === "adult" ? adultYear : mixedYear;
    const histMap = stream === "adult" ? adultHistory : mixedHistory;
    const ratingMap = stream === "adult" ? adultRating : mixedRating;
    advanceStreamYear(yearMap, histMap, ratingMap, key, seasonYear);
  };

  // --- Per-kind (singles/doubles) stream helpers ---

  // Current kind rating, falling back to the player's display rating
  // (adult ?? mixed ?? cold-start band midpoint) before they have any
  // same-kind history — a sensible prior for, e.g., a doubles veteran's
  // first singles match.
  const kindLookup = (key: string, kind: "S" | "D"): number => {
    const r = (kind === "S" ? singlesRating : doublesRating).get(key);
    if (r !== undefined) return r;
    return lookupForBasis(key, "adult");
  };

  const kindAnchorConfidence = (key: string, kind: "S" | "D"): number => {
    const count =
      (kind === "S" ? singlesCount : doublesCount).get(key) ?? 0;
    const isSelfRate = captures.players.get(key)?.ratingType === "S";
    const threshold = isSelfRate ? SELF_RATE_MATCHES : ESTABLISHED_MATCHES;
    return Math.min(count / threshold, 1);
  };

  // The rating this player uses to ANCHOR an opponent's kind perf: rolling
  // kind rating blended toward the band prior by kind confidence (provisional
  // players pulled toward their band so a thin kind history can't contaminate
  // opponents). Mirrors anchorRating for the category streams.
  const kindAnchor = (key: string, kind: "S" | "D"): number => {
    const rolling = kindLookup(key, kind);
    const c = kindAnchorConfidence(key, kind);
    if (c >= 1) return rolling;
    return c * rolling + (1 - c) * coldStart(key);
  };

  // Rate one match into its kind stream (S or D). Same symmetric, zero-sum
  // update as the category streams, but each side reads its own kind rolling
  // pre-ratings/anchors. Reuses the already-computed score deltas. Must run
  // while the category rolling ratings are still pre-match (before the
  // category appendForSide writes), so kindLookup's display fallback is
  // pre-match consistent.
  const rateKindStream = (
    m: CapturesData["matches"][number],
    homeDelta: number,
    visitorDelta: number,
    // Filled with each participant's kind pre-rating, for the history entry.
    kindPreOut: Map<string, number>
  ): void => {
    const kind = m.kind;
    const histMap = kind === "S" ? singlesHistory : doublesHistory;
    const ratingMap = kind === "S" ? singlesRating : doublesRating;
    const countMap = kind === "S" ? singlesCount : doublesCount;
    const yearMap = kind === "S" ? singlesYear : doublesYear;

    for (const key of [...m.homePlayerKeys, ...m.visitorPlayerKeys]) {
      advanceStreamYear(yearMap, histMap, ratingMap, key, m.seasonYear);
    }

    const homePre = m.homePlayerKeys.map((k) => kindLookup(k, kind));
    const visitorPre = m.visitorPlayerKeys.map((k) => kindLookup(k, kind));
    const homeMean = mean(homePre);
    const visitorMean = mean(visitorPre);
    const homeAnchorMean = mean(
      m.homePlayerKeys.map((k) => kindAnchor(k, kind))
    );
    const visitorAnchorMean = mean(
      m.visitorPlayerKeys.map((k) => kindAnchor(k, kind))
    );
    const homePerf = (homeMean + visitorAnchorMean) / 2 + homeDelta / 2;
    const visitorPerf = (visitorMean + homeAnchorMean) / 2 + visitorDelta / 2;

    const applySide = (
      keys: string[],
      pre: number[],
      sideMean: number,
      sidePerf: number,
      oppMean: number,
      sideWon: boolean
    ): void => {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const partnerPre = pre[i]!;
        kindPreOut.set(key, partnerPre);
        const rawPerf = sidePerf + (partnerPre - sideMean);
        const individualPerf = rawPerf; // no win-floor / loss-cap (see appendForSide)
        const entries = histMap.get(key) ?? [];
        const provisional = {
          perf: individualPerf,
          playerPreRating: partnerPre,
          opponentRating: oppMean,
        } as PerfMatchEntry;
        const newRating = computeCurrent(
          [...entries, provisional],
          coldStart(key)
        );
        entries.push(provisional);
        histMap.set(key, entries);
        ratingMap.set(key, newRating);
        countMap.set(key, (countMap.get(key) ?? 0) + 1);
      }
    };

    applySide(
      m.homePlayerKeys,
      homePre,
      homeMean,
      homePerf,
      visitorAnchorMean,
      m.homeWon!
    );
    applySide(
      m.visitorPlayerKeys,
      visitorPre,
      visitorMean,
      visitorPerf,
      homeAnchorMean,
      !m.homeWon!
    );
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

    // Classify the match. Both sides belong to the same match, so they
    // share the same category. Try homeTeamName first; if the two sides
    // disagree, fall back to "other".
    const homeCategory = classifyLeague(m.league, m.homeTeamName);
    const visitorCategory = classifyLeague(m.league, m.visitorTeamName);
    const category: MatchCategory =
      homeCategory === visitorCategory ? homeCategory : "other";
    const affectsRating = category === "adult" || category === "mixed";

    // Year-boundary carry-over: before rating this match, advance every
    // participating player's stream into the match's season. Only rating
    // streams have a year to advance; combo/other matches don't update a
    // stream, so they don't trigger a boundary. Done up front so the
    // pre-match ratings used below reflect the clamped carry-in.
    if (affectsRating) {
      const stream: "adult" | "mixed" =
        category === "adult" ? "adult" : "mixed";
      for (const key of m.homePlayerKeys) {
        applyYearBoundary(key, stream, m.seasonYear);
      }
      for (const key of m.visitorPlayerKeys) {
        applyYearBoundary(key, stream, m.seasonYear);
      }
    }

    // Determine which rating basis to use for perf computation.
    // Mixed matches always use the mixed basis. Adult + combo/other
    // use adult, with a per-player fallback to mixed if no adult exists.
    const defaultBasis: "adult" | "mixed" =
      category === "mixed" ? "mixed" : "adult";

    // Look up pre-match ratings for all players. Each player's basis may
    // differ (if a player lacks an adult rating, they fall back to mixed).
    const basisFor = (key: string): "adult" | "mixed" => {
      if (defaultBasis === "mixed") return "mixed";
      // adult basis, but fall back to mixed if player has no adult history
      if (adultRating.has(key)) return "adult";
      if (mixedRating.has(key)) return "mixed";
      return "adult"; // cold start — no history in either stream
    };

    // Use the team's collective basis (dominant basis across players).
    // For simplicity, use defaultBasis for the team-level anchor since
    // all players on a side share the same category.
    const homePre = m.homePlayerKeys.map((k) =>
      lookupForBasis(k, basisFor(k))
    );
    const visitorPre = m.visitorPlayerKeys.map((k) =>
      lookupForBasis(k, basisFor(k))
    );
    const homeMean = mean(homePre);
    const visitorMean = mean(visitorPre);

    // Confidence-weighted anchor means: each side's rating AS SEEN BY the
    // opponent, with provisional players blended toward their band prior.
    // These drive the opponent's perf (and the recorded opponentRating);
    // the raw homeMean/visitorMean above still drive the doubles spread
    // and each player's own pre-rating.
    const homeAnchorMean = mean(
      m.homePlayerKeys.map((k) => anchorRating(k, basisFor(k)))
    );
    const visitorAnchorMean = mean(
      m.visitorPlayerKeys.map((k) => anchorRating(k, basisFor(k)))
    );

    // Build per-set scores from the home side's perspective.
    const homeSets: PerfSetScore[] = m.sets.map((s) => ({
      won: s.home,
      lost: s.visitor,
    }));
    const visitorSets: PerfSetScore[] = m.sets.map((s) => ({
      won: s.visitor,
      lost: s.home,
    }));

    // Symmetric, zero-sum team perf (per project owner's doubles model).
    //
    // The score-table value `delta` is the rating GAP the score implies
    // between the two sides — NOT the winner's offset above the opponent.
    // We split the SURPRISE (implied gap − current court gap) evenly: each
    // side's team perf is the match midpoint plus half the signed delta.
    //
    //   teamPerf_side = (ownMean + oppMean)/2 + signedDelta/2
    //
    // so winner_team − loser_team == delta, centered on the shared midpoint.
    // Worked example: A/B(mean 3.40) beat C/D(mean 3.30), 6-4 6-4 → delta
    // 0.10. midpoint 3.35 → A/B = 3.40, C/D = 3.30 (won exactly as the gap
    // predicted ⇒ no move). Were delta 0.16, surprise 0.06 splits ±0.03 →
    // A/B 3.43, C/D 3.27. Per-player attribution below moves every partner
    // equally from their own pre-rating, preserving the partner spread.
    //
    // The opponent side uses the confidence-blended anchor mean (provisional
    // opponents pulled toward their band prior); our own side uses raw means.
    const homeDelta = scoreToPerfDelta(homeSets, m.homeWon); // + if home won
    const visitorDelta = scoreToPerfDelta(visitorSets, !m.homeWon); // opposite sign
    const homePerf = (homeMean + visitorAnchorMean) / 2 + homeDelta / 2;
    const visitorPerf = (visitorMean + homeAnchorMean) / 2 + visitorDelta / 2;

    // Update the hidden per-kind (singles/doubles) streams from this same
    // result. Independent of the category streams and run BEFORE the category
    // appendForSide writes below, so kindLookup's display fallback sees
    // pre-match category ratings. Only rating-affecting matches participate.
    // kindPreByKey captures each participant's kind pre-rating for the entry.
    const kindPreByKey = new Map<string, number>();
    if (affectsRating) rateKindStream(m, homeDelta, visitorDelta, kindPreByKey);

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
    // not simply the team perf. We preserve the partners' pre-match rating
    // spread exactly, so each player moves from THEIR OWN pre-rating by the
    // same amount (= teamPerf − team_mean_pre):
    //
    //   partner_perf = team_perf + (partner_pre − team_mean_pre)
    //
    // With the symmetric teamPerf above this means every player on a side
    // shifts by ±(surprise)/2 from their own pre-rating. Singles is the
    // trivial case (one player, spread = 0).
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

    const appendForSide = (
      sideKeys: string[],
      sidePre: number[],
      sideMean: number,
      sidePerf: number,
      sideRefs: PerfMatchPlayerRef[],
      oppRefs: PerfMatchPlayerRef[],
      oppMean: number,
      sideWon: boolean,
      sideSetsSigned: Array<{ playerGames: number; opponentGames: number }>,
      sideGamesDiff: number,
      playerTeamName: string,
      opponentTeamName: string
    ) => {
      for (let i = 0; i < sideKeys.length; i++) {
        const key = sideKeys[i]!;
        const partnerPre = sidePre[i]!;
        const rawPerf = sidePerf + (partnerPre - sideMean);
        // No win-floor / loss-cap. The symmetric, margin-aware perf already
        // encodes whether you met the level your rating gap predicts: you rise
        // on a better-than-expected result and drift DOWN on a worse one — even
        // on a win, if you only beat a much weaker opponent by less than the gap
        // implies (you can demonstrate at most ~half a band above whoever you
        // played). This lets an over-rated player self-correct over time instead
        // of ratcheting, matching tennisrecord's dynamic rating.
        const individualPerf = rawPerf;
        const partners = sideRefs.filter((_, j) => j !== i);

        const playerBasis = basisFor(key);

        const allEntries = history.get(key) ?? [];
        const adultEntries = adultHistory.get(key) ?? [];
        const mixedEntries = mixedHistory.get(key) ?? [];

        // Compute post-rating: only update the relevant stream's history.
        // For combo/other, post-rating reflects the current display
        // rating (adult ?? mixed ?? cold start) — unchanged by this match.
        let newStreamRating: number;
        if (affectsRating) {
          // We'll push the entry into the stream list and recompute.
          // Provisional carries pre/opp so its OWN closeness weight applies.
          const provisional = {
            perf: individualPerf,
            playerPreRating: partnerPre,
            opponentRating: oppMean,
          } as PerfMatchEntry;
          if (category === "adult") {
            const tempList = [...adultEntries, provisional];
            newStreamRating = computeCurrent(tempList, coldStart(key));
          } else {
            const tempList = [...mixedEntries, provisional];
            newStreamRating = computeCurrent(tempList, coldStart(key));
          }
        } else {
          // Non-rating match: post-rating stays at current display rating.
          newStreamRating = lookupForBasis(key, playerBasis);
        }

        const entry: PerfMatchEntry = {
          matchId: m.matchId,
          date: m.date,
          perf: individualPerf,
          teamPerf: sidePerf,
          playerPreRating: partnerPre,
          playerPostRating: newStreamRating,
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
          kindPreRating: kindPreByKey.get(key),
          category,
          affectsRating,
          perfBasis: playerBasis,
        };

        allEntries.push(entry);
        history.set(key, allEntries);

        if (affectsRating) {
          if (category === "adult") {
            adultEntries.push(entry);
            adultHistory.set(key, adultEntries);
            adultRating.set(key, newStreamRating);
            adultCount.set(key, (adultCount.get(key) ?? 0) + 1);
          } else {
            mixedEntries.push(entry);
            mixedHistory.set(key, mixedEntries);
            mixedRating.set(key, newStreamRating);
            mixedCount.set(key, (mixedCount.get(key) ?? 0) + 1);
          }
        }
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
      visitorAnchorMean,
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
      homeAnchorMean,
      !m.homeWon,
      visitorSetsSigned,
      gamesVisitor - gamesHome,
      m.visitorTeamName,
      m.homeTeamName
    );
  }

  // Final assembly: compute per-player PlayerPerfRatings.
  const playerRatings = new Map<string, PlayerPerfRatings>();
  const allKeys = new Set([
    ...history.keys(),
    ...adultHistory.keys(),
    ...mixedHistory.keys(),
  ]);
  for (const key of allKeys) {
    // Match counts come from the public history (real matches only); the
    // per-stream histories may carry a synthetic year-boundary seed that
    // must not be counted as a played match.
    const allH = history.get(key) ?? [];
    const adultMatches = allH.filter((e) => e.category === "adult").length;
    const mixedMatches = allH.filter((e) => e.category === "mixed").length;
    const otherMatches = allH.length - adultMatches - mixedMatches;
    // Rating values use the stream history (including any carry-in seed).
    const aHist = adultHistory.get(key);
    const mHist = mixedHistory.get(key);
    const adult =
      adultMatches > 0
        ? withPrior(computeCurrent(aHist ?? [], coldStart(key)), key, adultMatches)
        : undefined;
    const mixed =
      mixedMatches > 0
        ? withPrior(computeCurrent(mHist ?? [], coldStart(key)), key, mixedMatches)
        : undefined;
    const display = adult ?? mixed;
    // Hidden per-kind streams (optimizer-only). Match counts use the public
    // history (real, rating-affecting courts only) so a synthetic year-boundary
    // carry-in seed in the kind history is never counted as a played match.
    const singlesMatches = allH.filter(
      (e) => e.kind === "S" && e.affectsRating
    ).length;
    const doublesMatches = allH.filter(
      (e) => e.kind === "D" && e.affectsRating
    ).length;
    const sHist = singlesHistory.get(key);
    const dHist = doublesHistory.get(key);
    const singles =
      singlesMatches > 0
        ? withPrior(computeCurrent(sHist ?? [], coldStart(key)), key, singlesMatches)
        : undefined;
    const doubles =
      doublesMatches > 0
        ? withPrior(computeCurrent(dHist ?? [], coldStart(key)), key, doublesMatches)
        : undefined;
    playerRatings.set(key, {
      adult,
      mixed,
      display,
      adultMatches,
      mixedMatches,
      otherMatches,
      singles,
      doubles,
      singlesMatches,
      doublesMatches,
    });
  }

  // Back-compat ratings map (display rating per player).
  const ratings = new Map<string, number>();
  for (const [key, pr] of playerRatings) {
    if (pr.display !== undefined) ratings.set(key, pr.display);
  }

  return {
    playerRatings,
    ratings,
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

// USTA / tennisrecord-style per-match performance-rating driver.
//
// Model (opponent-anchored, no cold-start prior):
//
// - A player has NO rating until they've accumulated `ESTABLISHED_MATCHES`
//   rating-producing matches in a stream. Until then they are "unrated":
//   their first matches are computed (for their own calibration) but they do
//   NOT anchor anyone else, and they have no published rating.
// - Each match a player plays yields a per-match perf rating anchored purely on
//   the OPPONENT's current rating plus the score margin:
//       perf = opponentAnchor + scoreToPerfDelta(sets, won)
//   (No dependence on the player's own prior — a cold player's rating is
//   derived entirely from who they played and the score.)
// - The opponent anchor is the mean of the opponents who are RATED (>=3
//   matches). Unrated opponents don't anchor.
//     * Rated player vs a fully-unrated opponent → no valid anchor → that
//       match does NOT move the rated player's rating (recorded with a null
//       perf; the opponent shows as a dash in the UI).
//     * Unrated player vs a rated opponent → the rated opponent anchors the
//       unrated player's calibration match (it counts for them).
//     * ALL players unrated → bootstrap by anchoring on each opponent's
//       band-midpoint self-rating; the result is used for calibration.
// - A player's CURRENT rating (once rated) is the weighted mean of their recent
//   per-match perf ratings (default: last 10).
//
// Two parallel streams per player: `adult` (Adult matches) and `mixed` (Mixed
// matches). Combo / Tri-Level / Flexible matches don't produce a rating and
// don't update either stream; they still appear in history (perf = null).
//
// Doubles: the team's match rating = opponentAnchor + score margin. Individual
// attribution preserves the partner spread when BOTH partners are rated
// (partner_perf = team_perf + (partner_rolling − rated_team_mean)); an unrated
// partner just takes the team perf.
//
// Year boundaries: a rated player's stream rating is carried into the next
// season, clamped into that season's band. Unrated players carry nothing.

import { scoreToPerfDelta, type PerfSetScore } from "@tennis/ratings";
import type { CapturesData, PlayerLabel } from "./loadCaptures.js";
import { classifyLeague, type MatchCategory } from "./classifyLeague.js";

export interface PerfMatchPlayerRef {
  key: string;
  name: string;
  // This player/opponent/partner's rolling rating going INTO this match, or
  // null if they were UNRATED at the time (fewer than ESTABLISHED_MATCHES).
  preRating: number | null;
}

export interface PerfMatchEntry {
  matchId: string;
  date: Date;
  // Player's individual match rating for this match, or null when the match
  // produced no rating for them (combo/other, or no rated opponent to anchor).
  perf: number | null;
  // Team-level match rating (null when no rating was produced).
  teamPerf: number | null;
  // The player's rolling rating going INTO this match (null if unrated then).
  playerPreRating: number | null;
  // The player's rolling rating AFTER this match (their running value; null if
  // they still have no rating). Drives the per-player sparkline / "rating after".
  playerPostRating: number | null;

  // Mean of the RATED opponents' pre-match ratings (the anchor). Null when the
  // opponents were unrated (shown as a dash) — including the all-unrated
  // bootstrap, where a band-midpoint anchor was used internally but not shown.
  opponentRating: number | null;
  // Game differential (+ if won, − if lost). Useful for diagnostics.
  gamesDiff: number;

  opponents: PerfMatchPlayerRef[];
  partners: PerfMatchPlayerRef[];

  sets: Array<{ playerGames: number; opponentGames: number }>;
  won: boolean;

  playerTeamName: string;
  opponentTeamName: string;
  line: number;
  kind: "S" | "D";

  category: MatchCategory;
  // Whether this entry MOVED the player's rating stream (true only for an
  // adult/mixed match with a valid opponent anchor).
  affectsRating: boolean;
  perfBasis: "adult" | "mixed" | null;
}

export interface PlayerPerfRatings {
  // undefined until the player is rated (>= ESTABLISHED_MATCHES) in the stream.
  adult: number | undefined;
  mixed: number | undefined;
  display: number | undefined;
  adultMatches: number;
  mixedMatches: number;
  otherMatches: number;
}

export interface PerfRatingsResult {
  playerRatings: Map<string, PlayerPerfRatings>;
  ratings: Map<string, number>;
  history: Map<string, PerfMatchEntry[]>;
  skipped: number;
}

export interface ComputePerfRatingsOptions {
  // Self-rating used ONLY for the all-unrated bootstrap anchor. Default: the
  // player's band midpoint (label − 0.25), falling back to 3.25 if unlabeled.
  initialRating?: (p: PlayerLabel) => number;
  // Weight for the perf rating at history-index k counting BACK from the most
  // recent (k=0 is the latest match). Default: equal weight for the last 10.
  weightFn?: (kFromEnd: number) => number;
}

const DEFAULT_WEIGHT_FN = (k: number): number => (k < 10 ? 1 : 0);

// A player is "rated" — eligible to anchor others and to have a published
// rating — once they've produced this many rating matches in a stream.
const ESTABLISHED_MATCHES = 3;

// NTRP bands are continuous half-open ranges; band label N is the UPPER edge,
// so the typical continuous rating at band N is (N − 0.25).
export function ntrpBandMidpoint(label: number): number {
  return label - 0.25;
}

// Clamp a rating into the half-open band for `label`: (label-0.5, label].
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
  const weightFn = opts.weightFn ?? DEFAULT_WEIGHT_FN;

  // Public history (all appearances, every category).
  const history = new Map<string, PerfMatchEntry[]>();
  // Per-stream histories of rating-PRODUCING entries (+ any carry-in seed).
  const adultHistory = new Map<string, PerfMatchEntry[]>();
  const mixedHistory = new Map<string, PerfMatchEntry[]>();
  // Rolling rating per stream (latest weighted mean). Only set once a stream
  // has a rating-producing entry or a year-boundary carry seed.
  const adultRating = new Map<string, number>();
  const mixedRating = new Map<string, number>();
  // Career count of rating-PRODUCING matches per stream (NOT reset at year
  // boundaries). Drives the rated gate (>= ESTABLISHED_MATCHES).
  const adultCount = new Map<string, number>();
  const mixedCount = new Map<string, number>();
  // Last season advanced to, per stream (for carry-over).
  const adultYear = new Map<string, number>();
  const mixedYear = new Map<string, number>();
  let skipped = 0;

  const histFor = (stream: "adult" | "mixed") =>
    stream === "adult" ? adultHistory : mixedHistory;
  const ratingMapFor = (stream: "adult" | "mixed") =>
    stream === "adult" ? adultRating : mixedRating;
  const countFor = (stream: "adult" | "mixed") =>
    stream === "adult" ? adultCount : mixedCount;

  const streamRolling = (key: string, stream: "adult" | "mixed"): number | undefined =>
    ratingMapFor(stream).get(key);
  const streamCount = (key: string, stream: "adult" | "mixed"): number =>
    countFor(stream).get(key) ?? 0;
  const isRated = (key: string, stream: "adult" | "mixed"): boolean =>
    streamCount(key, stream) >= ESTABLISHED_MATCHES;

  const nameFor = (key: string): string =>
    captures.players.get(key)?.name ?? "(unknown)";

  const bandForYear = (key: string, year: number): number | undefined => {
    const p = captures.players.get(key);
    if (!p) return undefined;
    return p.ntrpByYear.get(year) ?? p.ntrp;
  };

  // Self-rating used only to bootstrap an all-unrated match.
  const selfRating = (key: string, year: number): number => {
    const p = captures.players.get(key);
    if (!p) return 3.25;
    if (opts.initialRating) return opts.initialRating(p);
    const band = p.ntrpByYear.get(year) ?? p.ntrp;
    return band !== undefined ? ntrpBandMidpoint(band) : 3.25;
  };

  // Weighted-mean rating from a chronological stream history (k=0 = newest).
  const computeCurrent = (entries: PerfMatchEntry[]): number | undefined => {
    if (entries.length === 0) return undefined;
    let num = 0;
    let den = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const kFromEnd = entries.length - 1 - i;
      const w = weightFn(kFromEnd);
      if (w <= 0) continue;
      const perf = entries[i]!.perf;
      if (perf == null) continue;
      num += w * perf;
      den += w;
    }
    return den > 0 ? num / den : undefined;
  };

  // Cross a rated player's stream into `seasonYear`: snapshot the prior year's
  // rolling rating, clamp into the new band, reseed the stream with a single
  // synthetic carry-in entry. Unrated players (no stream history) carry nothing.
  const applyYearBoundary = (
    key: string,
    stream: "adult" | "mixed",
    seasonYear: number
  ): void => {
    const yearMap = stream === "adult" ? adultYear : mixedYear;
    const prev = yearMap.get(key);
    if (prev !== undefined && seasonYear > prev) {
      const hist = histFor(stream);
      const entries = hist.get(key) ?? [];
      const current = computeCurrent(entries);
      if (current !== undefined) {
        const clamped = clampToBand(current, bandForYear(key, seasonYear));
        hist.set(key, [{ perf: clamped } as PerfMatchEntry]);
        ratingMapFor(stream).set(key, clamped);
      }
    }
    yearMap.set(key, Math.max(prev ?? seasonYear, seasonYear));
  };

  // A staged entry to commit after both sides of a match are built from
  // PRE-MATCH state (so neither side contaminates the other's anchor).
  interface Staged {
    key: string;
    entry: PerfMatchEntry;
    stream: "adult" | "mixed" | null; // non-null only when it moved a stream
  }

  for (const m of captures.matches) {
    if (m.homeWon === undefined) {
      skipped += 1;
      continue;
    }
    if (m.homePlayerKeys.length === 0 || m.visitorPlayerKeys.length === 0) {
      skipped += 1;
      continue;
    }

    const homeCategory = classifyLeague(m.league, m.homeTeamName);
    const visitorCategory = classifyLeague(m.league, m.visitorTeamName);
    const category: MatchCategory =
      homeCategory === visitorCategory ? homeCategory : "other";
    const affectsCategory = category === "adult" || category === "mixed";
    const stream: "adult" | "mixed" = category === "mixed" ? "mixed" : "adult";
    const year = m.seasonYear;

    if (affectsCategory) {
      for (const k of m.homePlayerKeys) applyYearBoundary(k, stream, year);
      for (const k of m.visitorPlayerKeys) applyYearBoundary(k, stream, year);
    }

    // Game differential for diagnostics.
    let gh = 0;
    let gv = 0;
    for (const s of m.sets) {
      gh += s.home;
      gv += s.visitor;
    }

    const homeSetsSigned = m.sets.map((s) => ({
      playerGames: s.home,
      opponentGames: s.visitor,
    }));
    const visitorSetsSigned = m.sets.map((s) => ({
      playerGames: s.visitor,
      opponentGames: s.home,
    }));

    // PRE-MATCH snapshots (read before any commit this match).
    const preRated = (k: string): boolean => isRated(k, stream);
    const preRolling = (k: string): number | undefined => streamRolling(k, stream);
    const refRating = (k: string): number | null =>
      preRated(k) ? preRolling(k)! : null;

    const staged: Staged[] = [];

    if (!affectsCategory) {
      // Combo / other: record the appearance, no rating produced.
      const build = (
        sideKeys: string[],
        oppKeys: string[],
        won: boolean,
        setsSigned: Array<{ playerGames: number; opponentGames: number }>,
        gamesDiff: number,
        teamName: string,
        oppTeamName: string
      ) => {
        const oppRefs = oppKeys.map((k) => ({
          key: k,
          name: nameFor(k),
          preRating: refRating(k),
        }));
        for (let i = 0; i < sideKeys.length; i++) {
          const key = sideKeys[i]!;
          const partners = sideKeys
            .filter((_, j) => j !== i)
            .map((k) => ({ key: k, name: nameFor(k), preRating: refRating(k) }));
          staged.push({
            key,
            stream: null,
            entry: {
              matchId: m.matchId,
              date: m.date,
              perf: null,
              teamPerf: null,
              playerPreRating: refRating(key),
              playerPostRating: preRolling(key) ?? null,
              opponentRating: null,
              gamesDiff,
              opponents: oppRefs,
              partners,
              sets: setsSigned,
              won,
              playerTeamName: teamName,
              opponentTeamName: oppTeamName,
              line: m.line,
              kind: m.kind,
              category,
              affectsRating: false,
              perfBasis: null,
            },
          });
        }
      };
      build(m.homePlayerKeys, m.visitorPlayerKeys, m.homeWon, homeSetsSigned, gh - gv, m.homeTeamName, m.visitorTeamName);
      build(m.visitorPlayerKeys, m.homePlayerKeys, !m.homeWon, visitorSetsSigned, gv - gh, m.visitorTeamName, m.homeTeamName);
      commit(staged);
      continue;
    }

    // Rating-affecting match. Determine anchors from pre-match state.
    const allUnrated =
      !m.homePlayerKeys.some(preRated) && !m.visitorPlayerKeys.some(preRated);

    // anchor as seen BY a side, looking at its opponents.
    const sideAnchor = (
      oppKeys: string[]
    ): { valid: boolean; anchor: number; display: number | null } => {
      const ratedOpp = oppKeys.filter(preRated);
      if (ratedOpp.length > 0) {
        const a = mean(ratedOpp.map((k) => preRolling(k)!));
        return { valid: true, anchor: a, display: a };
      }
      if (allUnrated) {
        const a = mean(oppKeys.map((k) => selfRating(k, year)));
        return { valid: true, anchor: a, display: null };
      }
      return { valid: false, anchor: 0, display: null };
    };

    const homeSets: PerfSetScore[] = m.sets.map((s) => ({ won: s.home, lost: s.visitor }));
    const visitorSets: PerfSetScore[] = m.sets.map((s) => ({ won: s.visitor, lost: s.home }));
    const homeDelta = scoreToPerfDelta(homeSets, m.homeWon);
    const visitorDelta = scoreToPerfDelta(visitorSets, !m.homeWon);

    const buildSide = (
      sideKeys: string[],
      oppKeys: string[],
      delta: number,
      won: boolean,
      setsSigned: Array<{ playerGames: number; opponentGames: number }>,
      gamesDiff: number,
      teamName: string,
      oppTeamName: string
    ) => {
      const anc = sideAnchor(oppKeys);
      const teamPerf = anc.valid ? anc.anchor + delta : null;
      // Spread baseline: mean of this side's RATED partners' rolling ratings.
      const ratedPres = sideKeys.filter(preRated).map((k) => preRolling(k)!);
      const teamMeanPre = ratedPres.length ? mean(ratedPres) : undefined;
      const oppRefs = oppKeys.map((k) => ({
        key: k,
        name: nameFor(k),
        preRating: refRating(k),
      }));

      for (let i = 0; i < sideKeys.length; i++) {
        const key = sideKeys[i]!;
        const partners = sideKeys
          .filter((_, j) => j !== i)
          .map((k) => ({ key: k, name: nameFor(k), preRating: refRating(k) }));

        let perf: number | null = null;
        if (anc.valid) {
          const offset =
            preRated(key) && teamMeanPre !== undefined
              ? preRolling(key)! - teamMeanPre
              : 0;
          perf = teamPerf! + offset;
        }
        const impact = anc.valid;

        // Running post rating: only changes when this entry moved the stream.
        let post: number | null;
        if (impact) {
          const tmp = [...(histFor(stream).get(key) ?? []), { perf } as PerfMatchEntry];
          post = computeCurrent(tmp) ?? null;
        } else {
          post = preRolling(key) ?? null;
        }

        staged.push({
          key,
          stream: impact ? stream : null,
          entry: {
            matchId: m.matchId,
            date: m.date,
            perf,
            teamPerf,
            playerPreRating: refRating(key),
            playerPostRating: post,
            opponentRating: anc.display,
            gamesDiff,
            opponents: oppRefs,
            partners,
            sets: setsSigned,
            won,
            playerTeamName: teamName,
            opponentTeamName: oppTeamName,
            line: m.line,
            kind: m.kind,
            category,
            affectsRating: impact,
            perfBasis: stream,
          },
        });
      }
    };

    buildSide(m.homePlayerKeys, m.visitorPlayerKeys, homeDelta, m.homeWon, homeSetsSigned, gh - gv, m.homeTeamName, m.visitorTeamName);
    buildSide(m.visitorPlayerKeys, m.homePlayerKeys, visitorDelta, !m.homeWon, visitorSetsSigned, gv - gh, m.visitorTeamName, m.homeTeamName);
    commit(staged);
  }

  // Commit staged entries: append to public history, and to the stream history
  // (+ rolling + count) for entries that produced a rating.
  function commit(staged: Staged[]): void {
    for (const s of staged) {
      const all = history.get(s.key) ?? [];
      all.push(s.entry);
      history.set(s.key, all);
      if (s.stream && s.entry.perf != null) {
        const h = histFor(s.stream).get(s.key) ?? [];
        h.push(s.entry);
        histFor(s.stream).set(s.key, h);
        ratingMapFor(s.stream).set(s.key, s.entry.playerPostRating!);
        countFor(s.stream).set(s.key, (countFor(s.stream).get(s.key) ?? 0) + 1);
      }
    }
  }

  // Final assembly.
  const playerRatings = new Map<string, PlayerPerfRatings>();
  const allKeys = new Set([
    ...history.keys(),
    ...adultHistory.keys(),
    ...mixedHistory.keys(),
  ]);
  for (const key of allKeys) {
    const allH = history.get(key) ?? [];
    const adultMatches = allH.filter((e) => e.category === "adult").length;
    const mixedMatches = allH.filter((e) => e.category === "mixed").length;
    const otherMatches = allH.length - adultMatches - mixedMatches;
    // Rated only once >= ESTABLISHED_MATCHES rating-producing matches exist.
    const adult =
      streamCount(key, "adult") >= ESTABLISHED_MATCHES
        ? computeCurrent(adultHistory.get(key) ?? [])
        : undefined;
    const mixed =
      streamCount(key, "mixed") >= ESTABLISHED_MATCHES
        ? computeCurrent(mixedHistory.get(key) ?? [])
        : undefined;
    const display = adult ?? mixed;
    playerRatings.set(key, {
      adult,
      mixed,
      display,
      adultMatches,
      mixedMatches,
      otherMatches,
    });
  }

  const ratings = new Map<string, number>();
  for (const [key, pr] of playerRatings) {
    if (pr.display !== undefined) ratings.set(key, pr.display);
  }

  return { playerRatings, ratings, history, skipped };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

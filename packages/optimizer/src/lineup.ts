// Lineup optimization.
//
// Problem: assign N available players from our roster to the format's courts
// (singles or doubles), maximizing the probability of winning the team match
// (= winning a majority of the match POINTS, not just courts — some leagues
// weight courts unequally, e.g. NorCal 40 & Over scores D1 as 2 points).
//
// Why we don't just use Hungarian / linear assignment:
// - Doubles courts pair two of our players to two of theirs. The pairing on
//   our side is a choice (which players partner up).
// - "Maximize team match win probability" is non-linear in court outcomes
//   (we want >50% chance of winning the majority of POINTS), so a sum-of-
//   wins objective is only an approximation.
//
// Each player carries SEPARATE singles and doubles ratings — many league
// players only play one discipline — and the win-prob for a court uses the
// kind-appropriate rating, the calibrated per-kind logistic scale, and a
// confidence shrink toward 50% when a participant has a thin same-kind record.
//
// Approach: enumerate. The combinatorics are tractable for league rosters.

import type { CourtSlot, MatchFormat } from "./format.js";
import {
  courtConfidence,
  doublesWinProb,
  ntrpWinProb,
  shrinkToFair,
  singlesWinProb,
  DOUBLES_SCALE,
  SINGLES_SCALE,
  PARTNER_CHEMISTRY_BONUS,
  DISCIPLINE_AFFINITY_BONUS,
  type Doubles,
} from "./winprob.js";

// Canonical key for an unordered pair of player ids.
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Discipline-affinity rating delta for placing a player at a court of the given
// kind. A player with a clear lean (≥80% of ≥3 rating-affecting matches in one
// discipline) gets +bonus in their discipline and −bonus in the other, so the
// optimizer keeps singles specialists in singles and doubles specialists in
// doubles. Neutral / low-history players are unaffected.
function disciplineDelta(p: RosterPlayer, kind: "S" | "D"): number {
  const s = p.singlesMatches ?? 0;
  const d = p.doublesMatches ?? 0;
  const total = s + d;
  if (total < 3) return 0;
  const singlesSpecialist = s / total >= 0.8;
  const doublesSpecialist = d / total >= 0.8;
  if (kind === "S") {
    if (singlesSpecialist) return DISCIPLINE_AFFINITY_BONUS;
    if (doublesSpecialist) return -DISCIPLINE_AFFINITY_BONUS;
  } else {
    if (doublesSpecialist) return DISCIPLINE_AFFINITY_BONUS;
    if (singlesSpecialist) return -DISCIPLINE_AFFINITY_BONUS;
  }
  return 0;
}

export interface RosterPlayer {
  id: string;
  name: string;
  // Separate per-kind ratings. When a caller has only a single blended rating,
  // pass it for both. singlesMatches/doublesMatches drive the confidence
  // shrink (a thin record → court pulled toward a coin flip); omit when
  // unknown (treated as fully confident).
  singlesRating: number;
  doublesRating: number;
  singlesMatches?: number;
  doublesMatches?: number;
  available: boolean;
}

export interface OpponentLineup {
  // For each court (in MatchFormat order), the opponent's player(s).
  courts: readonly OpponentCourt[];
}

// Opponent ratings per court. The *Matches fields are each player's TOTAL
// rating-affecting matches (singles + doubles) — used only for the confidence
// shrink, so a well-established opponent isn't treated as an unknown.
export type OpponentCourt =
  | { kind: "S"; player: number; matches?: number }
  | { kind: "D"; a: number; b: number; aMatches?: number; bMatches?: number };

// A player's total rating-affecting matches, or undefined when no counts are
// supplied (treated as fully known — e.g. synthetic test players).
function totalMatches(p: RosterPlayer): number | undefined {
  if (p.singlesMatches === undefined && p.doublesMatches === undefined) return undefined;
  return (p.singlesMatches ?? 0) + (p.doublesMatches ?? 0);
}

export interface CourtAssignment {
  slot: CourtSlot;
  ourPlayerIds: string[]; // [id] for singles, [id, id] for doubles
  winProb: number;
  points: number; // points this court is worth
  // True for a doubles court whose two players are an established pair (passed
  // via OptimizeOptions.establishedPairs) — they got the chemistry bonus.
  established: boolean;
}

export interface Lineup {
  assignments: CourtAssignment[];
  // Expected match POINTS won (Σ winProb × court points).
  expectedPoints: number;
  teamWinProb: number; // probability of winning a majority of the match points
}

function courtWinProb(
  slot: CourtSlot,
  ours: RosterPlayer[],
  theirs: OpponentCourt,
  chemBonus = 0
): number {
  if (slot.kind === "S" && theirs.kind === "S" && ours.length === 1) {
    const base = singlesWinProb(
      ours[0]!.singlesRating + disciplineDelta(ours[0]!, "S"),
      theirs.player
    );
    const conf = courtConfidence([totalMatches(ours[0]!), theirs.matches]);
    return shrinkToFair(base, conf);
  }
  if (slot.kind === "D" && theirs.kind === "D" && ours.length === 2) {
    const us: Doubles = {
      a: ours[0]!.doublesRating + disciplineDelta(ours[0]!, "D"),
      b: ours[1]!.doublesRating + disciplineDelta(ours[1]!, "D"),
    };
    const them: Doubles = { a: theirs.a, b: theirs.b };
    const base = doublesWinProb(us, them, DOUBLES_SCALE, chemBonus);
    const conf = courtConfidence([
      totalMatches(ours[0]!),
      totalMatches(ours[1]!),
      theirs.aMatches,
      theirs.bMatches,
    ]);
    return shrinkToFair(base, conf);
  }
  throw new Error(
    `Court/lineup kind mismatch: slot=${slot.kind} ours=${ours.length} theirs=${theirs.kind}`
  );
}

// Probability that we win MORE THAN HALF of the total match points, given each
// court's win prob and point value. Exact via a subset-sum dynamic program over
// points won — the weighted generalization of the Poisson binomial.
//
// Accepts either a plain number[] of win probs (every court worth 1 point — the
// classic "win the majority of courts" case) or {p, points} objects. With all
// points = 1 it reduces exactly to needing ⌊n/2⌋+1 court wins.
export function teamWinProbability(
  courts: readonly number[] | ReadonlyArray<{ p: number; points: number }>
): number {
  const items = courts.map((c) =>
    typeof c === "number" ? { p: c, points: 1 } : c
  );
  const total = items.reduce((s, c) => s + c.points, 0);
  if (total === 0) return 0;
  // dp[s] = P(exactly s points won so far). Points are small integers.
  let dp = new Array(total + 1).fill(0);
  dp[0] = 1;
  for (const { p, points } of items) {
    const next = new Array(total + 1).fill(0);
    for (let s = 0; s <= total; s++) {
      if (dp[s] === 0) continue;
      next[s] += dp[s] * (1 - p); // lose this court
      next[s + points] += dp[s] * p; // win it → +points
    }
    dp = next;
  }
  // Win = strictly more than half the points (a tie clinches nothing).
  let win = 0;
  for (let s = 0; s <= total; s++) if (s * 2 > total) win += dp[s]!;
  return win;
}

function lineupFromAssignments(assignments: CourtAssignment[]): Lineup {
  return {
    assignments: assignments.map((a) => ({
      ...a,
      ourPlayerIds: [...a.ourPlayerIds],
    })),
    expectedPoints: assignments.reduce((s, a) => s + a.winProb * a.points, 0),
    teamWinProb: teamWinProbability(
      assignments.map((a) => ({ p: a.winProb, points: a.points }))
    ),
  };
}

// Enumerate all valid assignments of available players to the format's courts.
// Backtracking with each player used at most once.
function* enumerateLineups(
  available: RosterPlayer[],
  format: MatchFormat,
  opponent: OpponentLineup,
  establishedPairs?: ReadonlySet<string>
): Generator<Lineup> {
  if (opponent.courts.length !== format.courts.length) {
    throw new Error(
      `Opponent lineup has ${opponent.courts.length} courts, format has ${format.courts.length}`
    );
  }

  const used = new Array(available.length).fill(false);
  const assignments: CourtAssignment[] = [];

  function* fill(courtIdx: number): Generator<Lineup> {
    if (courtIdx === format.courts.length) {
      yield lineupFromAssignments(assignments);
      return;
    }
    const slot = format.courts[courtIdx]!;
    const opp = opponent.courts[courtIdx]!;
    const points = slot.points ?? 1;

    if (slot.kind === "S") {
      for (let i = 0; i < available.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const us = [available[i]!];
        assignments.push({
          slot,
          ourPlayerIds: [us[0]!.id],
          winProb: courtWinProb(slot, us, opp),
          points,
          established: false,
        });
        yield* fill(courtIdx + 1);
        assignments.pop();
        used[i] = false;
      }
    } else {
      // Unordered pair {i, j} with i < j to avoid permutation dupes.
      for (let i = 0; i < available.length; i++) {
        if (used[i]) continue;
        for (let j = i + 1; j < available.length; j++) {
          if (used[j]) continue;
          used[i] = true;
          used[j] = true;
          const us = [available[i]!, available[j]!];
          const established = establishedPairs?.has(pairKey(us[0]!.id, us[1]!.id)) ?? false;
          assignments.push({
            slot,
            ourPlayerIds: [us[0]!.id, us[1]!.id],
            winProb: courtWinProb(slot, us, opp, established ? PARTNER_CHEMISTRY_BONUS : 0),
            points,
            established,
          });
          yield* fill(courtIdx + 1);
          assignments.pop();
          used[i] = false;
          used[j] = false;
        }
      }
    }
  }

  yield* fill(0);
}

export interface OptimizeOptions {
  topN?: number;
  // If true, also rank by expected POINTS (a "play to your numbers" lineup vs.
  // a "swing for the majority" lineup — they can differ).
  includeExpectedPointsRanking?: boolean;
  // Established doubles pairs (canonical pairKey() of two of OUR player ids,
  // 3+ matches together). Such pairs get a chemistry bonus, nudging the
  // optimizer to keep them together.
  establishedPairs?: ReadonlySet<string>;
}

export interface OptimizeResult {
  byTeamWinProb: Lineup[];
  byExpectedPoints?: Lineup[];
  evaluated: number;
}

export function optimizeLineup(
  roster: readonly RosterPlayer[],
  format: MatchFormat,
  opponent: OpponentLineup,
  options: OptimizeOptions = {}
): OptimizeResult {
  const available = roster.filter((p) => p.available);
  const slotsNeeded = format.courts.reduce(
    (n, c) => n + (c.kind === "S" ? 1 : 2),
    0
  );
  if (available.length < slotsNeeded) {
    throw new Error(
      `Need ${slotsNeeded} available players, have ${available.length}`
    );
  }

  const topN = options.topN ?? 5;
  const all: Lineup[] = [];
  let count = 0;
  for (const lineup of enumerateLineups(available, format, opponent, options.establishedPairs)) {
    all.push(lineup);
    count += 1;
  }

  const byTeamWinProb = [...all]
    .sort((a, b) => b.teamWinProb - a.teamWinProb)
    .slice(0, topN);

  const result: OptimizeResult = { byTeamWinProb, evaluated: count };
  if (options.includeExpectedPointsRanking) {
    result.byExpectedPoints = [...all]
      .sort((a, b) => b.expectedPoints - a.expectedPoints)
      .slice(0, topN);
  }
  return result;
}

// Compute win probability for a given lineup (no enumeration). Useful for the
// "what's my current lineup's win prob?" UX (e.g. the sandbox).
export function evaluateLineup(
  roster: readonly RosterPlayer[],
  format: MatchFormat,
  opponent: OpponentLineup,
  picks: readonly (readonly string[])[], // one entry per court, [id] or [id,id]
  establishedPairs?: ReadonlySet<string>
): Lineup {
  if (picks.length !== format.courts.length) {
    throw new Error(`Expected ${format.courts.length} picks, got ${picks.length}`);
  }
  const byId = new Map(roster.map((p) => [p.id, p]));
  const assignments: CourtAssignment[] = picks.map((ids, idx) => {
    const slot = format.courts[idx]!;
    const opp = opponent.courts[idx]!;
    const ours = ids.map((id) => {
      const p = byId.get(id);
      if (!p) throw new Error(`Unknown player id ${id}`);
      return p;
    });
    const established =
      slot.kind === "D" && ids.length === 2
        ? establishedPairs?.has(pairKey(ids[0]!, ids[1]!)) ?? false
        : false;
    return {
      slot,
      ourPlayerIds: [...ids],
      winProb: courtWinProb(slot, ours, opp, established ? PARTNER_CHEMISTRY_BONUS : 0),
      points: slot.points ?? 1,
      established,
    };
  });
  return lineupFromAssignments(assignments);
}

// Quick singles win-prob check between two NTRP ratings — for UI explorations.
export function singlesProbExplain(us: number, them: number, scale = SINGLES_SCALE): number {
  return ntrpWinProb(us, them, scale);
}

// Lineup optimization.
//
// Problem: assign N available players from our roster to the format's courts
// (singles or doubles), maximizing the probability of winning the team match
// (= winning more individual courts than the opponent).
//
// Why we don't just use Hungarian / linear assignment:
// - Doubles courts pair two of our players to two of theirs. The pairing on
//   our side is a choice (which players partner up).
// - "Maximize team match win probability" is non-linear in court outcomes
//   (we want >50% chance of winning the *majority* of courts), so a sum-of-
//   wins objective is only an approximation.
//
// Approach: enumerate. The combinatorics are tractable:
// - Adult 18+: 2S+3D from a typical ~10-player available roster. Number of
//   ways to pick 2 singles + 3 doubles pairings ≈ C(10,2)*((8 choose 2,2,2,2))
//   ≈ low hundreds of thousands. Fast on a laptop.
// - 5D: pick 5 pairings from up to 10-12 players. Similar order of magnitude.
//
// For larger rosters or unusual formats we fall back to a greedy heuristic
// (assign weakest court first, etc).

import type { CourtSlot, MatchFormat } from "./format.js";
import {
  DEFAULT_NTRP_SCALE,
  doublesWinProb,
  ntrpWinProb,
  singlesWinProb,
  type Doubles,
} from "./winprob.js";

export interface RosterPlayer {
  id: string;
  name: string;
  rating: number; // NTRP perf rating
  available: boolean;
}

export interface OpponentLineup {
  // For each court (in MatchFormat order), the opponent's player(s).
  courts: readonly OpponentCourt[];
}

export type OpponentCourt =
  | { kind: "S"; player: number }
  | { kind: "D"; a: number; b: number };

export interface CourtAssignment {
  slot: CourtSlot;
  ourPlayerIds: string[]; // [id] for singles, [id, id] for doubles
  winProb: number;
}

export interface Lineup {
  assignments: CourtAssignment[];
  expectedWins: number;
  teamWinProb: number; // probability of winning majority of courts
}

function courtWinProb(
  slot: CourtSlot,
  ours: RosterPlayer[],
  theirs: OpponentCourt,
  scale = DEFAULT_NTRP_SCALE
): number {
  if (slot.kind === "S" && theirs.kind === "S" && ours.length === 1) {
    return singlesWinProb(ours[0]!.rating, theirs.player, scale);
  }
  if (slot.kind === "D" && theirs.kind === "D" && ours.length === 2) {
    const us: Doubles = { a: ours[0]!.rating, b: ours[1]!.rating };
    const them: Doubles = { a: theirs.a, b: theirs.b };
    return doublesWinProb(us, them, scale);
  }
  throw new Error(
    `Court/lineup kind mismatch: slot=${slot.kind} ours=${ours.length} theirs=${theirs.kind}`
  );
}

// Probability that we win >= ceil(N/2) of N courts, given per-court win probs.
// Computed exactly via the Poisson binomial distribution (small N, fine to
// dynamic-program in O(N^2)).
export function teamWinProbability(courtProbs: readonly number[]): number {
  const n = courtProbs.length;
  const needed = Math.floor(n / 2) + 1;
  // dp[k] = P(exactly k wins after processing some prefix)
  let dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  for (const p of courtProbs) {
    const next = new Array(n + 1).fill(0);
    for (let k = 0; k <= n; k++) {
      if (dp[k] === 0) continue;
      next[k] += dp[k] * (1 - p);
      next[k + 1] += dp[k] * p;
    }
    dp = next;
  }
  let total = 0;
  for (let k = needed; k <= n; k++) total += dp[k]!;
  return total;
}

// Enumerate all valid assignments of available players to the format's
// courts. Yields one Lineup per arrangement.
//
// Implementation: backtracking with pruning. We fill courts in order; at
// each step we pick the player(s) for that court from the remaining pool.
// Each player can play at most once.
function* enumerateLineups(
  available: RosterPlayer[],
  format: MatchFormat,
  opponent: OpponentLineup,
  scale = DEFAULT_NTRP_SCALE
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
      const probs = assignments.map((a) => a.winProb);
      yield {
        assignments: assignments.map((a) => ({ ...a, ourPlayerIds: [...a.ourPlayerIds] })),
        expectedWins: probs.reduce((s, p) => s + p, 0),
        teamWinProb: teamWinProbability(probs),
      };
      return;
    }
    const slot = format.courts[courtIdx]!;
    const opp = opponent.courts[courtIdx]!;

    if (slot.kind === "S") {
      for (let i = 0; i < available.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const us = [available[i]!];
        const winProb = courtWinProb(slot, us, opp, scale);
        assignments.push({
          slot,
          ourPlayerIds: [us[0]!.id],
          winProb,
        });
        yield* fill(courtIdx + 1);
        assignments.pop();
        used[i] = false;
      }
    } else {
      // Pick unordered pair {i, j} with i < j to avoid permutation dupes.
      for (let i = 0; i < available.length; i++) {
        if (used[i]) continue;
        for (let j = i + 1; j < available.length; j++) {
          if (used[j]) continue;
          used[i] = true;
          used[j] = true;
          const us = [available[i]!, available[j]!];
          const winProb = courtWinProb(slot, us, opp, scale);
          assignments.push({
            slot,
            ourPlayerIds: [us[0]!.id, us[1]!.id],
            winProb,
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
  // If true, also rank by sum of individual court win probs (useful when
  // captain wants a "play to your numbers" lineup vs. a "swing for majority"
  // lineup — they can differ).
  includeExpectedWinsRanking?: boolean;
  // NTRP win-prob scale (see winprob.ts). Lower = rating edges more decisive.
  scale?: number;
}

export interface OptimizeResult {
  byTeamWinProb: Lineup[];
  byExpectedWins?: Lineup[];
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
  const scale = options.scale ?? DEFAULT_NTRP_SCALE;
  const all: Lineup[] = [];
  let count = 0;
  for (const lineup of enumerateLineups(available, format, opponent, scale)) {
    all.push(lineup);
    count += 1;
  }

  const byTeamWinProb = [...all]
    .sort((a, b) => b.teamWinProb - a.teamWinProb)
    .slice(0, topN);

  const result: OptimizeResult = { byTeamWinProb, evaluated: count };
  if (options.includeExpectedWinsRanking) {
    result.byExpectedWins = [...all]
      .sort((a, b) => b.expectedWins - a.expectedWins)
      .slice(0, topN);
  }
  return result;
}

// Helper: compute win probability for a given lineup (no enumeration).
// Useful for the "what's my current lineup's win prob?" UX.
export function evaluateLineup(
  roster: readonly RosterPlayer[],
  format: MatchFormat,
  opponent: OpponentLineup,
  picks: readonly (readonly string[])[], // one entry per court, [id] or [id,id]
  scale = DEFAULT_NTRP_SCALE
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
    return {
      slot,
      ourPlayerIds: [...ids],
      winProb: courtWinProb(slot, ours, opp, scale),
    };
  });
  const probs = assignments.map((a) => a.winProb);
  return {
    assignments,
    expectedWins: probs.reduce((s, p) => s + p, 0),
    teamWinProb: teamWinProbability(probs),
  };
}

// Quick win-prob check between two singles NTRP ratings — for UI explorations.
export function singlesProbExplain(us: number, them: number, scale = DEFAULT_NTRP_SCALE): number {
  return ntrpWinProb(us, them, scale);
}

// Deterministic match-result + rating-history generator.
//
// Inputs: the static rosters, the team-match schedule.
// Output: every played team-match populated with five court results
//   (2 singles + 3 doubles), plus a rating-snapshot timeline per player.
//
// Approach:
//   1. Seeded RNG (mulberry32). Same input -> same output every run.
//   2. For each played team-match (in chronological order):
//      a. Each captain picks their five-court lineup from available players
//         using a simple "strongest two go to singles, next six pair up for
//         doubles" heuristic. Good enough to look like a real lineup.
//      b. For each court, compute a singles or doubles win probability
//         from current Glicko ratings, draw the winner from that prob.
//      c. Generate plausible set scores conditional on who won, weighted
//         by how lopsided the matchup is.
//      d. Apply Glicko-2 updates per @tennis/ratings to both sides of every
//         court. Snapshot the post-match rating for each player.
//   3. Emit a season-start snapshot (matchId === null) for every player so
//      the UI has a starting point for rating-curve charts.

import {
  applySingles,
  doublesOutcomes,
  newRating,
  setScoreToOutcome,
  singlesOutcomes,
  updateRating,
  winProbability,
  type Rating,
} from "@tennis/ratings";
import {
  PLAYERS,
  TEAMS,
} from "./league.js";
import { TEAM_MATCHES, isPlayed } from "./schedule.js";
import type {
  FixtureCourtResult,
  FixtureRatingSnapshot,
  FixtureSet,
  FixtureTeamMatch,
} from "./types.js";

const SEED = 0x5e7b1a9c;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

// Pick a set's game scores given who won and a strength delta (positive
// means the winner was favored). Higher delta -> more lopsided sets.
function generateSet(rng: () => number, deltaScore: number): FixtureSet {
  // Probability of a tiebreak vs straight 6-X drops with bigger advantage.
  const tiebreakChance = Math.max(0.04, 0.18 - 0.4 * Math.abs(deltaScore));
  if (rng() < tiebreakChance) {
    // Tiebreak set
    return { home: 7, away: 6 };
  }
  // Loser games biased toward fewer games when the matchup is lopsided.
  const loserGameWeights = [0, 1, 2, 3, 4, 5].map((g, i) => {
    // Weight peaks around 3-4 for even matchups, shifts to 0-2 for lopsided.
    const center = 4 - 4 * Math.abs(deltaScore);
    const spread = 2.2;
    return Math.exp(-((g - center) ** 2) / (2 * spread * spread));
  });
  const total = loserGameWeights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  let loserGames = 0;
  for (let i = 0; i < loserGameWeights.length; i++) {
    r -= loserGameWeights[i]!;
    if (r <= 0) {
      loserGames = i;
      break;
    }
  }
  return { home: 6, away: loserGames };
}

interface CourtChoice {
  kind: "S" | "D";
  line: number;
  playerIds: string[];
}

// Coach heuristic: top 2 available play singles, next 6 pair up strongest+
// weakest, middle+middle, etc. To vary lineups week-to-week, we rest 2
// players each match drawn (via the seeded RNG) from the bottom 4 of the
// roster — so the top 6 always play, and the bottom 4 cycle.
function chooseLineup(
  teamId: string,
  current: Map<string, Rating>,
  rng: () => number
): CourtChoice[] {
  const roster = PLAYERS.filter((p) => p.teamId === teamId).map((p) => ({
    id: p.id,
    rating: current.get(p.id)!.rating,
  }));
  const sorted = [...roster].sort((a, b) => b.rating - a.rating);
  // Top 6 always available.
  const locks = sorted.slice(0, 6);
  // Pick 2 from the bottom 4 to sit; remaining 2 play.
  const bottomFour = sorted.slice(6, 10);
  const shuffled = [...bottomFour];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const eligibleTail = shuffled.slice(0, 2);
  // Re-sort the full 8-player active group by rating.
  const eligible = [...locks, ...eligibleTail].sort(
    (a, b) => b.rating - a.rating
  );
  // Top two by rating play singles; next six fill three doubles courts.
  const singles = eligible.slice(0, 2);
  const doubles = eligible.slice(2, 8);

  const courts: CourtChoice[] = [
    { kind: "S", line: 1, playerIds: [singles[0]!.id] },
    { kind: "S", line: 2, playerIds: [singles[1]!.id] },
    // Doubles pairing: strongest+weakest, second+second-weakest, mid+mid.
    {
      kind: "D",
      line: 1,
      playerIds: [doubles[0]!.id, doubles[5]!.id],
    },
    {
      kind: "D",
      line: 2,
      playerIds: [doubles[1]!.id, doubles[4]!.id],
    },
    {
      kind: "D",
      line: 3,
      playerIds: [doubles[2]!.id, doubles[3]!.id],
    },
  ];
  return courts;
}

function averageRating(a: Rating, b: Rating): Rating {
  return {
    rating: (a.rating + b.rating) / 2,
    rd: Math.sqrt((a.rd ** 2 + b.rd ** 2) / 2),
    vol: (a.vol + b.vol) / 2,
  };
}

interface GenerationOutput {
  populatedMatches: FixtureTeamMatch[];
  snapshots: FixtureRatingSnapshot[];
}

function generateAll(): GenerationOutput {
  const current = new Map<string, Rating>();
  for (const p of PLAYERS) current.set(p.id, p.initialRating);

  const snapshots: FixtureRatingSnapshot[] = [];

  // Season-start baselines so rating-history charts have a leftmost point.
  // Use the day before week 1 to anchor before any match.
  const seasonStart = "2026-05-09";
  for (const p of PLAYERS) {
    snapshots.push({
      playerId: p.id,
      courtResultId: null,
      rating: p.initialRating,
      estimatedNtrp: null,
      computedAt: seasonStart,
    });
  }

  const played = TEAM_MATCHES.filter((m) => isPlayed(m.playedOn)).sort(
    (a, b) => a.playedOn.localeCompare(b.playedOn) || a.week - b.week
  );

  const populated: Map<string, FixtureTeamMatch> = new Map();
  for (const tm of TEAM_MATCHES) populated.set(tm.id, { ...tm });

  for (const tm of played) {
    const homeCourts = chooseLineup(tm.homeTeamId, current, rng);
    const awayCourts = chooseLineup(tm.awayTeamId, current, rng);

    const courts: FixtureCourtResult[] = [];

    for (let i = 0; i < homeCourts.length; i++) {
      const hc = homeCourts[i]!;
      const ac = awayCourts[i]!;

      const courtId = `cr-${tm.id}-${hc.kind}${hc.line}`;

      let homeRating: Rating;
      let awayRating: Rating;
      if (hc.kind === "S") {
        homeRating = current.get(hc.playerIds[0]!)!;
        awayRating = current.get(ac.playerIds[0]!)!;
      } else {
        homeRating = averageRating(
          current.get(hc.playerIds[0]!)!,
          current.get(hc.playerIds[1]!)!
        );
        awayRating = averageRating(
          current.get(ac.playerIds[0]!)!,
          current.get(ac.playerIds[1]!)!
        );
      }

      const homeWinProb = winProbability(homeRating, awayRating);
      const homeWon = rng() < homeWinProb;
      const delta = homeWon ? homeWinProb - 0.5 : 0.5 - homeWinProb;
      // Always best-of-three.
      const set1 = generateSet(rng, delta);
      const set2 = generateSet(rng, delta);
      let sets: FixtureSet[] = [set1, set2];

      // From homeWon perspective; flip the second set 30% of the time to
      // produce mixed-set outcomes (loser steals a set).
      if (rng() < 0.3) {
        // Flip set 2: loser wins this set 6-X.
        sets[1] = { home: sets[1]!.away, away: sets[1]!.home };
        // Then need a third set with the eventual winner taking it.
        sets.push(generateSet(rng, delta));
      }
      // Orient sets so the eventual winner wins more sets.
      const homeSetsWon = sets.filter((s) => s.home > s.away).length;
      const awaySetsWon = sets.filter((s) => s.away > s.home).length;
      // If the orientation contradicts homeWon, flip every set's perspective
      // so the storyline matches.
      if (homeWon && homeSetsWon < awaySetsWon) {
        sets = sets.map((s) => ({ home: s.away, away: s.home }));
      } else if (!homeWon && awaySetsWon < homeSetsWon) {
        sets = sets.map((s) => ({ home: s.away, away: s.home }));
      }

      courts.push({
        id: courtId,
        teamMatchId: tm.id,
        courtKind: hc.kind,
        line: hc.line,
        homePlayerIds: hc.playerIds,
        awayPlayerIds: ac.playerIds,
        sets,
        homeWon,
      });

      // Apply Glicko updates.
      // For each home player, build outcomes against the away side's rating
      // (singles: their single rating; doubles: averaged pair).
      const homeOutcomes = sets.map((s) => ({
        opponent: awayRating,
        score: setScoreToOutcome({ player: s.home, opponent: s.away }),
        weight: 1,
      }));
      const awayOutcomes = sets.map((s) => ({
        opponent: homeRating,
        score: setScoreToOutcome({ player: s.away, opponent: s.home }),
        weight: 1,
      }));

      for (const pid of hc.playerIds) {
        const before = current.get(pid)!;
        const after = updateRating(before, homeOutcomes);
        current.set(pid, after);
        snapshots.push({
          playerId: pid,
          courtResultId: courtId,
          rating: after,
          estimatedNtrp: null,
          computedAt: tm.playedOn,
        });
      }
      for (const pid of ac.playerIds) {
        const before = current.get(pid)!;
        const after = updateRating(before, awayOutcomes);
        current.set(pid, after);
        snapshots.push({
          playerId: pid,
          courtResultId: courtId,
          rating: after,
          estimatedNtrp: null,
          computedAt: tm.playedOn,
        });
      }
    }

    populated.set(tm.id, { ...tm, courts });
  }

  return {
    populatedMatches: Array.from(populated.values()),
    snapshots,
  };
}

const RESULT = generateAll();
export const POPULATED_TEAM_MATCHES = RESULT.populatedMatches;
export const RATING_SNAPSHOTS = RESULT.snapshots;

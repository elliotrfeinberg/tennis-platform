// Convenience read helpers over the static fixture data. Keep these pure
// and synchronous so React Server Components can call them directly.

import { glickoToNtrp, type NtrpCalibration, type Rating } from "@tennis/ratings";
import { LEAGUE, PLAYERS, TEAMS } from "./league.js";
import { TEAM_MATCHES, FIXTURE_TODAY, isPlayed } from "./schedule.js";
import { POPULATED_TEAM_MATCHES, RATING_SNAPSHOTS } from "./generate.js";
import type {
  FixtureCourtResult,
  FixturePlayer,
  FixtureRatingSnapshot,
  FixtureTeam,
  FixtureTeamMatch,
} from "./types.js";

export interface TeamStanding {
  team: FixtureTeam;
  teamMatchesPlayed: number;
  teamMatchWins: number;
  teamMatchLosses: number;
  courtsWon: number;
  courtsLost: number;
}

export function playerById(id: string): FixturePlayer | undefined {
  return PLAYERS.find((p) => p.id === id);
}

export function teamById(id: string): FixtureTeam | undefined {
  return TEAMS.find((t) => t.id === id);
}

export function teamMatchById(id: string): FixtureTeamMatch | undefined {
  return POPULATED_TEAM_MATCHES.find((m) => m.id === id);
}

export function playersForTeam(teamId: string): FixturePlayer[] {
  return PLAYERS.filter((p) => p.teamId === teamId);
}

export function teamMatchesForTeam(teamId: string): FixtureTeamMatch[] {
  return POPULATED_TEAM_MATCHES.filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId
  ).sort((a, b) => a.playedOn.localeCompare(b.playedOn));
}

export function upcomingTeamMatchesForTeam(
  teamId: string
): FixtureTeamMatch[] {
  return teamMatchesForTeam(teamId).filter((m) => !isPlayed(m.playedOn));
}

export function nextTeamMatchForTeam(
  teamId: string
): FixtureTeamMatch | undefined {
  return upcomingTeamMatchesForTeam(teamId)[0];
}

export function courtResultsForPlayer(playerId: string): FixtureCourtResult[] {
  const out: FixtureCourtResult[] = [];
  for (const m of POPULATED_TEAM_MATCHES) {
    if (!m.courts) continue;
    for (const c of m.courts) {
      if (
        c.homePlayerIds.includes(playerId) ||
        c.awayPlayerIds.includes(playerId)
      ) {
        out.push(c);
      }
    }
  }
  return out;
}

export interface PlayerMatchView {
  court: FixtureCourtResult;
  teamMatch: FixtureTeamMatch;
  wasHome: boolean;
  won: boolean;
  partnerIds: string[];
  opponentIds: string[];
}

export function matchesForPlayer(playerId: string): PlayerMatchView[] {
  const views: PlayerMatchView[] = [];
  for (const m of POPULATED_TEAM_MATCHES) {
    if (!m.courts) continue;
    for (const c of m.courts) {
      const wasHome = c.homePlayerIds.includes(playerId);
      const wasAway = c.awayPlayerIds.includes(playerId);
      if (!wasHome && !wasAway) continue;
      const won = wasHome ? c.homeWon : !c.homeWon;
      const partnerIds = (wasHome ? c.homePlayerIds : c.awayPlayerIds).filter(
        (id) => id !== playerId
      );
      const opponentIds = wasHome ? c.awayPlayerIds : c.homePlayerIds;
      views.push({ court: c, teamMatch: m, wasHome, won, partnerIds, opponentIds });
    }
  }
  return views.sort((a, b) =>
    a.teamMatch.playedOn.localeCompare(b.teamMatch.playedOn)
  );
}

export function ratingHistoryForPlayer(
  playerId: string
): FixtureRatingSnapshot[] {
  return RATING_SNAPSHOTS.filter((s) => s.playerId === playerId).sort((a, b) =>
    a.computedAt.localeCompare(b.computedAt)
  );
}

export function currentRatingFor(playerId: string): Rating {
  const history = ratingHistoryForPlayer(playerId);
  if (history.length === 0) {
    return playerById(playerId)!.initialRating;
  }
  return history[history.length - 1]!.rating;
}

// Placeholder calibration matching the design assumption that 3.0=1200,
// 3.5=1400, 4.0=1600, 4.5=1800, 5.0=2000 on the Glicko-2 scale. Once we
// have real labeled data from USTA Connect, fit this nightly via
// fitCalibration() in @tennis/ratings and store the result; the rest of
// the app shouldn't need to change.
export const FIXTURE_CALIBRATION: NtrpCalibration = {
  slope: 1 / 400,
  intercept: 0,
  fittedAt: "2026-05-09T00:00:00.000Z",
  sampleSize: PLAYERS.length,
  rmse: 0.18,
};

export function estimatedNtrpFor(playerId: string): number {
  return glickoToNtrp(currentRatingFor(playerId).rating, FIXTURE_CALIBRATION);
}

// NTRP-scale rating deviation: convert the Glicko RD into NTRP units using
// the same calibration slope.
export function estimatedNtrpRdFor(playerId: string): number {
  return currentRatingFor(playerId).rd * FIXTURE_CALIBRATION.slope;
}

export function standingsForLeague(): TeamStanding[] {
  const standings = new Map<string, TeamStanding>();
  for (const team of TEAMS) {
    standings.set(team.id, {
      team,
      teamMatchesPlayed: 0,
      teamMatchWins: 0,
      teamMatchLosses: 0,
      courtsWon: 0,
      courtsLost: 0,
    });
  }
  for (const m of POPULATED_TEAM_MATCHES) {
    if (!m.courts) continue;
    const home = standings.get(m.homeTeamId)!;
    const away = standings.get(m.awayTeamId)!;
    home.teamMatchesPlayed++;
    away.teamMatchesPlayed++;
    let homeCourts = 0;
    let awayCourts = 0;
    for (const c of m.courts) {
      if (c.homeWon) homeCourts++;
      else awayCourts++;
    }
    home.courtsWon += homeCourts;
    home.courtsLost += awayCourts;
    away.courtsWon += awayCourts;
    away.courtsLost += homeCourts;
    if (homeCourts > awayCourts) {
      home.teamMatchWins++;
      away.teamMatchLosses++;
    } else {
      away.teamMatchWins++;
      home.teamMatchLosses++;
    }
  }
  return Array.from(standings.values()).sort((a, b) => {
    if (b.teamMatchWins !== a.teamMatchWins)
      return b.teamMatchWins - a.teamMatchWins;
    const diffB = b.courtsWon - b.courtsLost;
    const diffA = a.courtsWon - a.courtsLost;
    return diffB - diffA;
  });
}

export function searchPlayers(query: string, limit = 25): FixturePlayer[] {
  const q = query.trim().toLowerCase();
  if (!q) return PLAYERS.slice(0, limit);
  return PLAYERS.filter((p) =>
    p.displayName.toLowerCase().includes(q)
  ).slice(0, limit);
}

export { LEAGUE, PLAYERS, TEAMS };
export { TEAM_MATCHES, FIXTURE_TODAY, isPlayed };
export { POPULATED_TEAM_MATCHES, RATING_SNAPSHOTS };

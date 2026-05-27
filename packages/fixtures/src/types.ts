// Plain TS shapes for the in-memory fixture league. These mirror the
// logical shape of @tennis/db's schema but stay free of Drizzle types so
// the same data can drive UI, tests, and (eventually) the db seed without
// dragging the postgres driver into the browser.

import type { Rating } from "@tennis/ratings";

export type Gender = "M" | "F" | "X";
export type CourtKind = "S" | "D";

export interface FixturePlayer {
  id: string;
  displayName: string;
  section: string;
  district: string;
  gender: Gender;
  publishedNtrp: number;
  // Starting Glicko at the beginning of the season. Latest rating is
  // computed from the match history; see currentRatingFor / ratingHistoryFor.
  initialRating: Rating;
  teamId: string;
}

export interface FixtureTeam {
  id: string;
  name: string;
  section: string;
  league: string;
  season: string;
  ntrpLevel: number;
  homeFacility: string;
  captainPlayerId: string;
}

export interface FixtureLeague {
  id: string;
  name: string;
  section: string;
  season: string;
  ntrpLevel: number;
  format: "ADULT_2S_3D" | "MIXED_5D";
  teamIds: string[];
}

// One scheduled team-vs-team meeting. Played meetings have courts populated
// with real per-court results; upcoming ones have courts === null.
export interface FixtureTeamMatch {
  id: string;
  leagueId: string;
  week: number; // 1..N
  playedOn: string; // ISO date (YYYY-MM-DD)
  homeTeamId: string;
  awayTeamId: string;
  courts: FixtureCourtResult[] | null;
}

export interface FixtureSet {
  home: number;
  away: number;
}

export interface FixtureCourtResult {
  id: string;
  teamMatchId: string;
  courtKind: CourtKind;
  line: number;
  homePlayerIds: string[]; // 1 entry for S, 2 for D
  awayPlayerIds: string[];
  sets: FixtureSet[];
  homeWon: boolean;
}

// Append-only-style rating snapshot. One per (player, courtResult) plus
// one "season start" row (matchId === null) so the UI can show the curve
// from the opening rating onward.
export interface FixtureRatingSnapshot {
  playerId: string;
  // null => season-start baseline; otherwise the court result id this
  // snapshot is the *after* state of.
  courtResultId: string | null;
  rating: Rating;
  estimatedNtrp: number | null;
  computedAt: string; // ISO date
}

// Postgres schema for the tennis platform.
//
// Design notes:
//
// - tennislink uses opaque player IDs that we treat as the canonical
//   identifier; we keep a separate internal UUID so we can support players
//   who haven't been seen on tennislink yet (manual entry, self-rate).
//
// - Match rows store both raw set scores (for re-running rating updates)
//   and the resulting rating snapshot per player, so we can recompute
//   without losing history.
//
// - ratings_history is append-only: one row per (player, computed_at). We
//   never UPDATE a rating; we INSERT a new one. This gives us match-by-match
//   rating charts for free (the "how my rating moved this season" view).
//
// - Lineups are first-class: captains save them, share them, get win-prob
//   re-scored when opponent rosters update.

import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---- enums ----

export const courtKindEnum = pgEnum("court_kind", ["S", "D"]);
export const matchTypeEnum = pgEnum("match_type", [
  "league",
  "tournament",
  "user_submitted",
]);
export const genderEnum = pgEnum("gender", ["M", "F", "X"]);

// ---- core ----

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tennislinkId: varchar("tennislink_id", { length: 64 }).unique(),
    displayName: text("display_name").notNull(),
    section: varchar("section", { length: 32 }), // "Florida", "NorCal", etc.
    district: varchar("district", { length: 64 }),
    gender: genderEnum("gender"),
    // Latest published year-end NTRP level. NULL if unrated.
    publishedNtrp: doublePrecision("published_ntrp"),
    publishedNtrpYear: integer("published_ntrp_year"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("players_section_idx").on(t.section),
    index("players_display_name_idx").on(t.displayName),
  ]
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tennislinkId: varchar("tennislink_id", { length: 64 }).unique(),
    name: text("name").notNull(),
    section: varchar("section", { length: 32 }),
    league: text("league"), // e.g. "Adult 40 & Over 4.0 Women"
    season: varchar("season", { length: 16 }), // "2025-spring"
    ntrpLevel: doublePrecision("ntrp_level"),
    homeFacility: text("home_facility"),
    captainPlayerId: uuid("captain_player_id").references(() => players.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("teams_section_season_idx").on(t.section, t.season),
    index("teams_league_idx").on(t.league),
  ]
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.playerId] })]
);

// One row per court played in a team-match. For singles, side*Player1 is
// set and side*Player2 is null; for doubles both are set.
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tennislinkId: varchar("tennislink_id", { length: 64 }).unique(),
    matchType: matchTypeEnum("match_type").notNull().default("league"),
    courtKind: courtKindEnum("court_kind").notNull(),
    playedOn: timestamp("played_on", { withTimezone: true }).notNull(),

    homeTeamId: uuid("home_team_id").references(() => teams.id),
    awayTeamId: uuid("away_team_id").references(() => teams.id),

    // Court / line number (1, 2, ...).
    line: integer("line"),

    homePlayer1Id: uuid("home_player1_id")
      .notNull()
      .references(() => players.id),
    homePlayer2Id: uuid("home_player2_id").references(() => players.id),
    awayPlayer1Id: uuid("away_player1_id")
      .notNull()
      .references(() => players.id),
    awayPlayer2Id: uuid("away_player2_id").references(() => players.id),

    // sets: [{ home: 6, away: 4 }, { home: 7, away: 5 }] — typed loosely
    // since we serialize to jsonb; runtime validation handled in services.
    sets: jsonb("sets").notNull(),

    homeWon: boolean("home_won").notNull(),

    // Where it came from in case we want to re-parse / debug.
    sourceUrl: text("source_url"),
    rawHash: varchar("raw_hash", { length: 64 }),

    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("matches_played_on_idx").on(t.playedOn),
    index("matches_home_team_idx").on(t.homeTeamId),
    index("matches_away_team_idx").on(t.awayTeamId),
    index("matches_home_p1_idx").on(t.homePlayer1Id),
    index("matches_away_p1_idx").on(t.awayPlayer1Id),
  ]
);

// Append-only rating snapshots. One row per (player, match) AND one row
// per nightly recompute even with no matches (to mark inactivity decay).
export const ratingsHistory = pgTable(
  "ratings_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    // NULL means "scheduled recompute, no match"; non-null means "after this match"
    matchId: uuid("match_id").references(() => matches.id, {
      onDelete: "cascade",
    }),
    rating: doublePrecision("rating").notNull(),
    rd: doublePrecision("rd").notNull(),
    vol: doublePrecision("vol").notNull(),
    estimatedNtrp: doublePrecision("estimated_ntrp"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ratings_player_computed_idx").on(t.playerId, t.computedAt),
    uniqueIndex("ratings_player_match_unique").on(t.playerId, t.matchId),
  ]
);

// Current rating cache. Updated by the same job that writes ratings_history.
// Lets the player-search page skip the per-player ORDER BY computed_at DESC.
export const currentRatings = pgTable("current_ratings", {
  playerId: uuid("player_id")
    .primaryKey()
    .references(() => players.id, { onDelete: "cascade" }),
  rating: doublePrecision("rating").notNull(),
  rd: doublePrecision("rd").notNull(),
  vol: doublePrecision("vol").notNull(),
  estimatedNtrp: doublePrecision("estimated_ntrp"),
  matchCount90d: integer("match_count_90d").notNull().default(0),
  matchCountTotal: integer("match_count_total").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// NTRP calibration is fit nightly. Keep history so we can audit shifts.
export const calibrations = pgTable("calibrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  slope: doublePrecision("slope").notNull(),
  intercept: doublePrecision("intercept").notNull(),
  sampleSize: integer("sample_size").notNull(),
  rmse: doublePrecision("rmse").notNull(),
  fittedAt: timestamp("fitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Captain-saved lineups. One row per draft/version.
export const lineups = pgTable(
  "lineups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "vs. Riverside Tennis Club, 4/13"
    formatName: text("format_name").notNull(), // "USTA Adult League (2S + 3D)"
    // courts: [{ slot: {index, kind}, playerIds: [uuid] }]
    assignments: jsonb("assignments").notNull(),
    opponent: jsonb("opponent"), // OpponentLineup if known
    teamWinProb: doublePrecision("team_win_prob"),
    notes: text("notes"),
    createdBy: uuid("created_by"), // future: users table
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lineups_team_idx").on(t.teamId)]
);

// Scraper bookkeeping: per-source-URL, what we last fetched and when.
export const crawlState = pgTable(
  "crawl_state",
  {
    url: text("url").primaryKey(),
    etag: varchar("etag", { length: 128 }),
    lastModified: varchar("last_modified", { length: 64 }),
    contentHash: varchar("content_hash", { length: 64 }),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastStatus: integer("last_status").notNull(),
    nextFetchAfter: timestamp("next_fetch_after", { withTimezone: true }),
  },
  (t) => [index("crawl_next_fetch_idx").on(t.nextFetchAfter)]
);

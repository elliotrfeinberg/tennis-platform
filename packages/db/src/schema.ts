// Postgres schema for the tennis platform.
//
// Hierarchy mirrors USTA's structure:
//
//   section -> district -> league (year+type) -> flight (gender+level)
//      -> subflight (local cluster) -> team -> roster + schedule
//      schedule = sequence of team_matches, each broken into court_matches
//      court_matches store set-by-set scores
//
// Identifier strategy:
//
//   - Internal UUIDs are the joinable primary keys.
//   - USTA's numeric ids (player member id, team id, match id) are the
//     canonical external keys when we can get them — but USTA *redacts the
//     team id* on team-profile pages ("Team ID: *****") and *omits the
//     member id* on rendered HTML. We catch them only on player-detail
//     pages, which we fetch lazily.
//   - The URL-routable par1 hex token (e.g. "DB00637B...") is what we have
//     immediately. The same team has multiple par1 encodings depending on
//     entry point, so we store them as an array and dedupe teams by
//     (name, season).

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
export const teamMatchStatusEnum = pgEnum("team_match_status", [
  "scheduled",
  "completed",
  "default",
  "not_played",
]);

// ---- geographic hierarchy ----

// USTA sections (17 nationally). Use the canonical code as PK so cross-
// section references are stable; displayName for UI.
export const sections = pgTable("sections", {
  code: varchar("code", { length: 64 }).primaryKey(), // "USTA/NO. CALIFORNIA"
  displayName: text("display_name").notNull(),
});

export const districts = pgTable(
  "districts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionCode: varchar("section_code", { length: 64 })
      .notNull()
      .references(() => sections.code),
    name: text("name").notNull(), // "NO. CALIFORNIA"
  },
  (t) => [uniqueIndex("districts_section_name_uq").on(t.sectionCode, t.name)]
);

// ---- league hierarchy ----

// A league is the section+year+type tuple, e.g. "2026 ADULT 18&Over" in
// USTA/NO. CALIFORNIA. formatKind is a coarse classifier; the exact court
// layout lives on each flight.
export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionCode: varchar("section_code", { length: 64 })
      .notNull()
      .references(() => sections.code),
    districtId: uuid("district_id").references(() => districts.id),
    year: integer("year").notNull(),
    name: text("name").notNull(), // "2026 ADULT 18&Over"
    formatKind: varchar("format_kind", { length: 32 }), // "adult", "mixed", "combo", "tri_level"
    // USTA's leaked numeric id, e.g. "107456". Captured in ViewState; not
    // visible in normal HTML. Optional until we wire ViewState extraction.
    ustaLeagueId: varchar("usta_league_id", { length: 32 }),
  },
  (t) => [
    uniqueIndex("leagues_section_year_name_uq").on(
      t.sectionCode,
      t.year,
      t.name
    ),
  ]
);

// A flight is the NTRP+gender split within a league: "Women's 3.5".
export const flights = pgTable(
  "flights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "Women's 3.5"
    gender: genderEnum("gender").notNull(),
    ntrpLevel: doublePrecision("ntrp_level").notNull(), // 3.5
    ustaFlightId: varchar("usta_flight_id", { length: 32 }),
  },
  (t) => [uniqueIndex("flights_league_name_uq").on(t.leagueId, t.name)]
);

// A subflight is the local cluster within a flight: "Women's 3.5 - DN - 1".
// One subflight is the unit a team's schedule round-robins through.
export const subflights = pgTable(
  "subflights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flightId: uuid("flight_id")
      .notNull()
      .references(() => flights.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "Women's 3.5 - DN - 1"
    ustaSubflightId: varchar("usta_subflight_id", { length: 32 }),
  },
  (t) => [uniqueIndex("subflights_flight_name_uq").on(t.flightId, t.name)]
);

// ---- players ----

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // USTA's numeric member id (e.g. "2010673783"). Canonical cross-season
    // identifier. NULL until we've fetched the player-detail page that
    // exposes it; ingest uses (displayName, teamId, season) until then.
    ustaMemberId: varchar("usta_member_id", { length: 32 }).unique(),
    displayName: text("display_name").notNull(),
    sectionCode: varchar("section_code", { length: 64 }).references(
      () => sections.code
    ),
    districtId: uuid("district_id").references(() => districts.id),
    gender: genderEnum("gender"),
    // Most recent year-end published NTRP. NULL if unrated.
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
    index("players_section_idx").on(t.sectionCode),
    index("players_display_name_idx").on(t.displayName),
  ]
);

// Per-season published-rating snapshot from the public NTRP rating search
// (phase-1 "load players" output). Raw ingest data — distinct from the
// derived perf/Glicko ratings tables below. Holds the per-year NTRP band +
// rating type AND the par1 token that is the entry point for phase-2 match
// crawling. One row per (player, year).
export const playerYearRatings = pgTable(
  "player_year_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    // Published NTRP for that year (e.g. 3.5). NULL when unrated.
    ntrp: doublePrecision("ntrp"),
    // USTA rating type: "C" computer, "S" self, "A" appeal, etc.
    ratingType: varchar("rating_type", { length: 8 }),
    ratingDate: timestamp("rating_date", { withTimezone: true }),
    // URL-routable par1 token for this player (decoded form). Entry point
    // for the player's league flights / Match Summary crawl.
    tennislinkPar1: text("tennislink_par1"),
    gender: genderEnum("gender"),
    city: text("city"),
    state: varchar("state", { length: 8 }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("player_year_ratings_player_year_uq").on(t.playerId, t.year),
    index("player_year_ratings_year_idx").on(t.year),
  ]
);

// ---- teams ----

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subflightId: uuid("subflight_id")
      .notNull()
      .references(() => subflights.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Denormalized year for fast season-scoped queries. Always matches
    // leagues.year via the subflight->flight->league chain.
    year: integer("year").notNull(),
    // USTA's leaked numeric id (e.g. "5083144154"). Redacted in rendered
    // HTML, so usually NULL. Source of truth for dedup is (name, year).
    ustaTeamId: varchar("usta_team_id", { length: 32 }),
    // All par1 hex tokens we've seen for this team. Same team gets multiple
    // depending on entry point (flight standings vs schedule vs share link).
    // Used to recognize a team from any URL; not authoritative.
    tennislinkPars: text("tennislink_pars")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    homeFacility: text("home_facility"),
    captainPlayerId: uuid("captain_player_id").references(() => players.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("teams_name_year_uq").on(t.name, t.year),
    index("teams_subflight_idx").on(t.subflightId),
    index("teams_year_idx").on(t.year),
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

// ---- matches ----

// One row per scheduled meeting between two teams on a date. Carries the
// summary status + denormalized court-win counts. Per-court detail lives
// in court_matches.
export const teamMatches = pgTable(
  "team_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // USTA's numeric match id (e.g. "1011875481"). Visible in the team
    // profile's ViewScore() onclick handlers. Stable, unique.
    ustaMatchId: varchar("usta_match_id", { length: 32 }).unique(),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => teams.id),
    visitorTeamId: uuid("visitor_team_id")
      .notNull()
      .references(() => teams.id),
    playedOn: timestamp("played_on", { withTimezone: true }).notNull(),
    dateScheduled: timestamp("date_scheduled", { withTimezone: true }),
    dateEntered: timestamp("date_entered", { withTimezone: true }),
    status: teamMatchStatusEnum("status").notNull().default("scheduled"),
    // Confirmation note like "Confirmed by Lisa Italia (V)".
    confirmation: text("confirmation"),
    // Denormalized court-win totals — kept in sync by the ingest job.
    homeCourtsWon: integer("home_courts_won").notNull().default(0),
    visitorCourtsWon: integer("visitor_courts_won").notNull().default(0),
    sourceUrl: text("source_url"),
    rawHash: varchar("raw_hash", { length: 64 }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("team_matches_played_on_idx").on(t.playedOn),
    index("team_matches_home_idx").on(t.homeTeamId),
    index("team_matches_visitor_idx").on(t.visitorTeamId),
  ]
);

// One row per court within a team-match. Line numbering is per-kind:
// (kind=S, line=1) is S1; (kind=D, line=2) is D2. Sets are stored as
// jsonb: [{ home: 6, visitor: 4 }, ...].
export const courtMatches = pgTable(
  "court_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamMatchId: uuid("team_match_id")
      .notNull()
      .references(() => teamMatches.id, { onDelete: "cascade" }),
    matchType: matchTypeEnum("match_type").notNull().default("league"),
    courtKind: courtKindEnum("court_kind").notNull(),
    line: integer("line").notNull(),

    homePlayer1Id: uuid("home_player1_id")
      .notNull()
      .references(() => players.id),
    homePlayer2Id: uuid("home_player2_id").references(() => players.id),
    visitorPlayer1Id: uuid("visitor_player1_id")
      .notNull()
      .references(() => players.id),
    visitorPlayer2Id: uuid("visitor_player2_id").references(() => players.id),

    sets: jsonb("sets").notNull(),
    homeWon: boolean("home_won").notNull(),
    completed: boolean("completed").notNull().default(true),

    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("court_matches_team_match_kind_line_uq").on(
      t.teamMatchId,
      t.courtKind,
      t.line
    ),
    index("court_matches_home_p1_idx").on(t.homePlayer1Id),
    index("court_matches_visitor_p1_idx").on(t.visitorPlayer1Id),
  ]
);

// ---- ratings ----

// Append-only rating snapshots. One row per (player, court_match) AND one
// row per nightly recompute even with no matches (for inactivity decay).
export const ratingsHistory = pgTable(
  "ratings_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    courtMatchId: uuid("court_match_id").references(() => courtMatches.id, {
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
    uniqueIndex("ratings_player_match_uq").on(t.playerId, t.courtMatchId),
  ]
);

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

// ---- captain workspace ----

export const lineups = pgTable(
  "lineups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Optionally tied to a specific team-match (e.g. "vs Round Hill, 5/11").
    teamMatchId: uuid("team_match_id").references(() => teamMatches.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    formatName: text("format_name").notNull(),
    assignments: jsonb("assignments").notNull(),
    opponent: jsonb("opponent"),
    teamWinProb: doublePrecision("team_win_prob"),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lineups_team_idx").on(t.teamId)]
);

// ---- scraper bookkeeping ----

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

CREATE TYPE "public"."court_kind" AS ENUM('S', 'D');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('M', 'F', 'X');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('league', 'tournament', 'user_submitted');--> statement-breakpoint
CREATE TYPE "public"."team_match_status" AS ENUM('scheduled', 'completed', 'default', 'not_played');--> statement-breakpoint
CREATE TABLE "calibrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slope" double precision NOT NULL,
	"intercept" double precision NOT NULL,
	"sample_size" integer NOT NULL,
	"rmse" double precision NOT NULL,
	"fitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_match_id" uuid NOT NULL,
	"match_type" "match_type" DEFAULT 'league' NOT NULL,
	"court_kind" "court_kind" NOT NULL,
	"line" integer NOT NULL,
	"home_player1_id" uuid NOT NULL,
	"home_player2_id" uuid,
	"visitor_player1_id" uuid NOT NULL,
	"visitor_player2_id" uuid,
	"sets" jsonb NOT NULL,
	"home_won" boolean NOT NULL,
	"completed" boolean DEFAULT true NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_state" (
	"url" text PRIMARY KEY NOT NULL,
	"etag" varchar(128),
	"last_modified" varchar(64),
	"content_hash" varchar(64),
	"last_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" integer NOT NULL,
	"next_fetch_after" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "current_ratings" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"rating" double precision NOT NULL,
	"rd" double precision NOT NULL,
	"vol" double precision NOT NULL,
	"estimated_ntrp" double precision,
	"match_count_90d" integer DEFAULT 0 NOT NULL,
	"match_count_total" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_code" varchar(64) NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gender" "gender" NOT NULL,
	"ntrp_level" double precision NOT NULL,
	"usta_flight_id" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_code" varchar(64) NOT NULL,
	"district_id" uuid,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"format_kind" varchar(32),
	"usta_league_id" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"team_match_id" uuid,
	"label" text NOT NULL,
	"format_name" text NOT NULL,
	"assignments" jsonb NOT NULL,
	"opponent" jsonb,
	"team_win_prob" double precision,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usta_member_id" varchar(32),
	"display_name" text NOT NULL,
	"section_code" varchar(64),
	"district_id" uuid,
	"gender" "gender",
	"published_ntrp" double precision,
	"published_ntrp_year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_usta_member_id_unique" UNIQUE("usta_member_id")
);
--> statement-breakpoint
CREATE TABLE "ratings_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"court_match_id" uuid,
	"rating" double precision NOT NULL,
	"rd" double precision NOT NULL,
	"vol" double precision NOT NULL,
	"estimated_ntrp" double precision,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subflights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flight_id" uuid NOT NULL,
	"name" text NOT NULL,
	"usta_subflight_id" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "team_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usta_match_id" varchar(32),
	"home_team_id" uuid NOT NULL,
	"visitor_team_id" uuid NOT NULL,
	"played_on" timestamp with time zone NOT NULL,
	"date_scheduled" timestamp with time zone,
	"date_entered" timestamp with time zone,
	"status" "team_match_status" DEFAULT 'scheduled' NOT NULL,
	"confirmation" text,
	"home_courts_won" integer DEFAULT 0 NOT NULL,
	"visitor_courts_won" integer DEFAULT 0 NOT NULL,
	"source_url" text,
	"raw_hash" varchar(64),
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_matches_usta_match_id_unique" UNIQUE("usta_match_id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_player_id_pk" PRIMARY KEY("team_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subflight_id" uuid NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"usta_team_id" varchar(32),
	"tennislink_pars" text[] DEFAULT '{}'::text[] NOT NULL,
	"home_facility" text,
	"captain_player_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "court_matches" ADD CONSTRAINT "court_matches_team_match_id_team_matches_id_fk" FOREIGN KEY ("team_match_id") REFERENCES "public"."team_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_matches" ADD CONSTRAINT "court_matches_home_player1_id_players_id_fk" FOREIGN KEY ("home_player1_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_matches" ADD CONSTRAINT "court_matches_home_player2_id_players_id_fk" FOREIGN KEY ("home_player2_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_matches" ADD CONSTRAINT "court_matches_visitor_player1_id_players_id_fk" FOREIGN KEY ("visitor_player1_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_matches" ADD CONSTRAINT "court_matches_visitor_player2_id_players_id_fk" FOREIGN KEY ("visitor_player2_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_ratings" ADD CONSTRAINT "current_ratings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_section_code_sections_code_fk" FOREIGN KEY ("section_code") REFERENCES "public"."sections"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flights" ADD CONSTRAINT "flights_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_section_code_sections_code_fk" FOREIGN KEY ("section_code") REFERENCES "public"."sections"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_team_match_id_team_matches_id_fk" FOREIGN KEY ("team_match_id") REFERENCES "public"."team_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_section_code_sections_code_fk" FOREIGN KEY ("section_code") REFERENCES "public"."sections"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings_history" ADD CONSTRAINT "ratings_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings_history" ADD CONSTRAINT "ratings_history_court_match_id_court_matches_id_fk" FOREIGN KEY ("court_match_id") REFERENCES "public"."court_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subflights" ADD CONSTRAINT "subflights_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_matches" ADD CONSTRAINT "team_matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_matches" ADD CONSTRAINT "team_matches_visitor_team_id_teams_id_fk" FOREIGN KEY ("visitor_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_subflight_id_subflights_id_fk" FOREIGN KEY ("subflight_id") REFERENCES "public"."subflights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_player_id_players_id_fk" FOREIGN KEY ("captain_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "court_matches_team_match_kind_line_uq" ON "court_matches" USING btree ("team_match_id","court_kind","line");--> statement-breakpoint
CREATE INDEX "court_matches_home_p1_idx" ON "court_matches" USING btree ("home_player1_id");--> statement-breakpoint
CREATE INDEX "court_matches_visitor_p1_idx" ON "court_matches" USING btree ("visitor_player1_id");--> statement-breakpoint
CREATE INDEX "crawl_next_fetch_idx" ON "crawl_state" USING btree ("next_fetch_after");--> statement-breakpoint
CREATE UNIQUE INDEX "districts_section_name_uq" ON "districts" USING btree ("section_code","name");--> statement-breakpoint
CREATE UNIQUE INDEX "flights_league_name_uq" ON "flights" USING btree ("league_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_section_year_name_uq" ON "leagues" USING btree ("section_code","year","name");--> statement-breakpoint
CREATE INDEX "lineups_team_idx" ON "lineups" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "players_section_idx" ON "players" USING btree ("section_code");--> statement-breakpoint
CREATE INDEX "players_display_name_idx" ON "players" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "ratings_player_computed_idx" ON "ratings_history" USING btree ("player_id","computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_player_match_uq" ON "ratings_history" USING btree ("player_id","court_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subflights_flight_name_uq" ON "subflights" USING btree ("flight_id","name");--> statement-breakpoint
CREATE INDEX "team_matches_played_on_idx" ON "team_matches" USING btree ("played_on");--> statement-breakpoint
CREATE INDEX "team_matches_home_idx" ON "team_matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "team_matches_visitor_idx" ON "team_matches" USING btree ("visitor_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_year_uq" ON "teams" USING btree ("name","year");--> statement-breakpoint
CREATE INDEX "teams_subflight_idx" ON "teams" USING btree ("subflight_id");--> statement-breakpoint
CREATE INDEX "teams_year_idx" ON "teams" USING btree ("year");
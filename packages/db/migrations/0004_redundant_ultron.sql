CREATE TABLE "perf_match_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"court_match_id" uuid NOT NULL,
	"played_on" timestamp with time zone,
	"category" varchar(8) NOT NULL,
	"perf" double precision NOT NULL,
	"team_perf" double precision,
	"pre_rating" double precision,
	"post_rating" double precision,
	"opponent_rating" double precision,
	"won" boolean NOT NULL,
	"affects_rating" boolean DEFAULT true NOT NULL,
	"perf_basis" varchar(8)
);
--> statement-breakpoint
CREATE TABLE "player_perf_ratings" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"adult" double precision,
	"mixed" double precision,
	"display" double precision,
	"adult_matches" integer DEFAULT 0 NOT NULL,
	"mixed_matches" integer DEFAULT 0 NOT NULL,
	"other_matches" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perf_match_results" ADD CONSTRAINT "perf_match_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perf_match_results" ADD CONSTRAINT "perf_match_results_court_match_id_court_matches_id_fk" FOREIGN KEY ("court_match_id") REFERENCES "public"."court_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_perf_ratings" ADD CONSTRAINT "player_perf_ratings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "perf_match_results_player_court_uq" ON "perf_match_results" USING btree ("player_id","court_match_id");--> statement-breakpoint
CREATE INDEX "perf_match_results_player_idx" ON "perf_match_results" USING btree ("player_id");
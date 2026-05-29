CREATE TABLE "flight_catalog" (
	"flight_key" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"league" text NOT NULL,
	"flight_name" text NOT NULL,
	"flight_code" varchar(32),
	"reach_par1" text NOT NULL,
	"reach_team_anchor_id" text NOT NULL,
	"reach_team_name" text,
	"match_count" integer,
	"match_summary_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_enum_visits" (
	"par1" text PRIMARY KEY NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"teams_found" integer DEFAULT 0 NOT NULL,
	"new_flights" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "flight_matches" (
	"usta_match_id" varchar(32) PRIMARY KEY NOT NULL,
	"flight_key" text NOT NULL,
	"year" integer NOT NULL,
	"played_on" timestamp with time zone,
	"home_team" text,
	"visitor_team" text,
	"scorecard_fetched" boolean DEFAULT false NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "flight_catalog_year_idx" ON "flight_catalog" USING btree ("year");--> statement-breakpoint
CREATE INDEX "flight_matches_flight_idx" ON "flight_matches" USING btree ("flight_key");--> statement-breakpoint
CREATE INDEX "flight_matches_fetched_idx" ON "flight_matches" USING btree ("scorecard_fetched");
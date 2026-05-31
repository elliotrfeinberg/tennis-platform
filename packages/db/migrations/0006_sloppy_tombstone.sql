CREATE TABLE "subflight_catalog" (
	"subflight_key" text PRIMARY KEY NOT NULL,
	"flight_key" text NOT NULL,
	"year" integer NOT NULL,
	"league" text NOT NULL,
	"flight_name" text NOT NULL,
	"subflight_name" text NOT NULL,
	"reach_par1" text,
	"reach_team_anchor_id" text,
	"reach_team_name" text,
	"member_teams" text[] DEFAULT '{}'::text[] NOT NULL,
	"standings_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subflight_enum_visits" (
	"par1" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subflight_name" text,
	"teams_found" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "subflights" ADD COLUMN "reach_par1" text;--> statement-breakpoint
ALTER TABLE "subflights" ADD COLUMN "reach_year" integer;--> statement-breakpoint
ALTER TABLE "subflights" ADD COLUMN "reach_team_name" text;--> statement-breakpoint
CREATE INDEX "subflight_catalog_flight_idx" ON "subflight_catalog" USING btree ("flight_key");
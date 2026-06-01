ALTER TABLE "player_perf_ratings" ADD COLUMN "singles" double precision;--> statement-breakpoint
ALTER TABLE "player_perf_ratings" ADD COLUMN "doubles" double precision;--> statement-breakpoint
ALTER TABLE "player_perf_ratings" ADD COLUMN "singles_matches" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_perf_ratings" ADD COLUMN "doubles_matches" integer DEFAULT 0 NOT NULL;
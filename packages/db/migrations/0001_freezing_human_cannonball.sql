CREATE TABLE "player_year_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"ntrp" double precision,
	"rating_type" varchar(8),
	"rating_date" timestamp with time zone,
	"tennislink_par1" text,
	"gender" "gender",
	"city" text,
	"state" varchar(8),
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_year_ratings" ADD CONSTRAINT "player_year_ratings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_year_ratings_player_year_uq" ON "player_year_ratings" USING btree ("player_id","year");--> statement-breakpoint
CREATE INDEX "player_year_ratings_year_idx" ON "player_year_ratings" USING btree ("year");
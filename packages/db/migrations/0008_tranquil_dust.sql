CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "court_matches_home_p2_idx" ON "court_matches" USING btree ("home_player2_id");--> statement-breakpoint
CREATE INDEX "court_matches_visitor_p2_idx" ON "court_matches" USING btree ("visitor_player2_id");--> statement-breakpoint
CREATE INDEX "players_display_name_trgm_idx" ON "players" USING gin ("display_name" gin_trgm_ops);
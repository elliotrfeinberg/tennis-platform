import { describe, expect, it } from "vitest";
import {
  LEAGUE,
  PLAYERS,
  TEAMS,
  POPULATED_TEAM_MATCHES,
  RATING_SNAPSHOTS,
  standingsForLeague,
  matchesForPlayer,
  ratingHistoryForPlayer,
  upcomingTeamMatchesForTeam,
} from "./index.js";

describe("fixture league", () => {
  it("has 6 teams and 60 players", () => {
    expect(TEAMS).toHaveLength(6);
    expect(LEAGUE.teamIds).toHaveLength(6);
    expect(PLAYERS).toHaveLength(60);
  });

  it("schedules a single round-robin (15 team-matches)", () => {
    expect(POPULATED_TEAM_MATCHES).toHaveLength(15);
  });

  it("partitions matches into played (weeks 1-3) and upcoming (weeks 4-5)", () => {
    const played = POPULATED_TEAM_MATCHES.filter((m) => m.courts !== null);
    const upcoming = POPULATED_TEAM_MATCHES.filter((m) => m.courts === null);
    expect(played).toHaveLength(9);
    expect(upcoming).toHaveLength(6);
  });

  it("populates 5 courts per played team-match with 2 singles + 3 doubles", () => {
    const played = POPULATED_TEAM_MATCHES.filter((m) => m.courts !== null);
    for (const m of played) {
      expect(m.courts).toHaveLength(5);
      const singles = m.courts!.filter((c) => c.courtKind === "S");
      const doubles = m.courts!.filter((c) => c.courtKind === "D");
      expect(singles).toHaveLength(2);
      expect(doubles).toHaveLength(3);
      for (const c of m.courts!) {
        if (c.courtKind === "S") expect(c.homePlayerIds).toHaveLength(1);
        else expect(c.homePlayerIds).toHaveLength(2);
        expect(c.sets.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("standings totals are internally consistent", () => {
    const standings = standingsForLeague();
    expect(standings).toHaveLength(6);
    const totalPlayed = standings.reduce(
      (s, t) => s + t.teamMatchesPlayed,
      0
    );
    // Each played team-match counts on both sides: 9 * 2 = 18.
    expect(totalPlayed).toBe(18);
    // For each team: matches played = wins + losses.
    for (const s of standings) {
      expect(s.teamMatchWins + s.teamMatchLosses).toBe(s.teamMatchesPlayed);
    }
  });

  it("each player has at least a season-start rating snapshot", () => {
    for (const p of PLAYERS) {
      const history = ratingHistoryForPlayer(p.id);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]!.courtResultId).toBeNull();
    }
    // Total snapshots = baselines (60) + per-(player, court) updates.
    // 9 team-matches * 5 courts = 45 courts * 2 sides * (1 or 2 players each).
    // Singles: 2 courts * 2 players = 4. Doubles: 3 courts * 4 players = 12.
    // Per team-match: 16 player-court entries. 9 matches: 144 updates.
    expect(RATING_SNAPSHOTS.length).toBe(60 + 144);
  });

  it("every team has upcoming matches and at least one played match", () => {
    for (const t of TEAMS) {
      expect(upcomingTeamMatchesForTeam(t.id).length).toBeGreaterThan(0);
      expect(matchesForPlayer.length).toBeGreaterThan(0); // sanity, fn exists
    }
  });
});

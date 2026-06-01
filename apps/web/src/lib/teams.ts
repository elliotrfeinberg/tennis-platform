import "server-only";
import { createClient } from "@tennis/db";
import { sql } from "drizzle-orm";

let _db: ReturnType<typeof createClient> | undefined;
function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = createClient(url);
  }
  return _db;
}

export interface FlightRef {
  id: string;
  year: number;
  league: string;
  name: string;
  teams: number;
  matches: number;
}

// Flights that have at least one ingested team match, busiest first.
export async function listFlights(): Promise<FlightRef[]> {
  const rows = (await db().execute(sql`
    SELECT f.id, l.year, l.name AS league, f.name,
           count(DISTINCT t.id)::int AS teams,
           count(DISTINCT tm.id)::int AS matches
    FROM flights f
    JOIN leagues l ON l.id = f.league_id
    JOIN subflights sf ON sf.flight_id = f.id
    JOIN teams t ON t.subflight_id = sf.id
    LEFT JOIN team_matches tm ON tm.home_team_id = t.id OR tm.visitor_team_id = t.id
    WHERE l.name NOT ILIKE '%default match%'
    GROUP BY f.id, l.year, l.name, f.name
    HAVING count(tm.id) > 0
    ORDER BY matches DESC
  `)) as unknown as FlightRef[];
  return rows;
}

export interface StandingRow {
  id: string;
  name: string;
  w: number;
  l: number;
  cw: number;
  cl: number;
}

export interface FlightStandings {
  flight: FlightRef | null;
  rows: StandingRow[];
}

// Standings for one flight: team-match W/L + court wins for/against, ranked by
// wins then court differential.
export async function flightStandings(flightId: string): Promise<FlightStandings> {
  const flights = await listFlights();
  const flight = flights.find((f) => f.id === flightId) ?? null;
  if (!flight) return { flight: null, rows: [] };

  const rows = (await db().execute(sql`
    WITH ft AS (
      SELECT t.id, t.name FROM teams t
      JOIN subflights sf ON sf.flight_id = ${flightId} AND t.subflight_id = sf.id
    ),
    perteam AS (
      SELECT ft.id, ft.name,
        sum(CASE WHEN tm.home_team_id = ft.id THEN tm.home_courts_won ELSE tm.visitor_courts_won END)::int AS cw,
        sum(CASE WHEN tm.home_team_id = ft.id THEN tm.visitor_courts_won ELSE tm.home_courts_won END)::int AS cl,
        sum(CASE WHEN (tm.home_team_id = ft.id AND tm.home_courts_won > tm.visitor_courts_won)
                   OR (tm.visitor_team_id = ft.id AND tm.visitor_courts_won > tm.home_courts_won) THEN 1 ELSE 0 END)::int AS w,
        sum(CASE WHEN (tm.home_team_id = ft.id AND tm.home_courts_won < tm.visitor_courts_won)
                   OR (tm.visitor_team_id = ft.id AND tm.visitor_courts_won < tm.home_courts_won) THEN 1 ELSE 0 END)::int AS l
      FROM ft
      LEFT JOIN team_matches tm ON tm.home_team_id = ft.id OR tm.visitor_team_id = ft.id
      GROUP BY ft.id, ft.name
    )
    SELECT id, name, coalesce(w,0) w, coalesce(l,0) l, coalesce(cw,0) cw, coalesce(cl,0) cl
    FROM perteam
    ORDER BY coalesce(w,0) DESC, (coalesce(cw,0) - coalesce(cl,0)) DESC, name ASC
  `)) as unknown as StandingRow[];
  return { flight, rows };
}

// Standings scoped to a single subflight (the real round-robin pod) — same
// math as flightStandings but over the subflight's teams. This is the "teams
// you actually play" table a captain cares about.
export async function subflightStandings(subflightId: string): Promise<StandingRow[]> {
  const rows = (await db().execute(sql`
    WITH ft AS (
      SELECT t.id, t.name FROM teams t WHERE t.subflight_id = ${subflightId}
    ),
    perteam AS (
      SELECT ft.id, ft.name,
        sum(CASE WHEN tm.home_team_id = ft.id THEN tm.home_courts_won ELSE tm.visitor_courts_won END)::int AS cw,
        sum(CASE WHEN tm.home_team_id = ft.id THEN tm.visitor_courts_won ELSE tm.home_courts_won END)::int AS cl,
        sum(CASE WHEN (tm.home_team_id = ft.id AND tm.home_courts_won > tm.visitor_courts_won)
                   OR (tm.visitor_team_id = ft.id AND tm.visitor_courts_won > tm.home_courts_won) THEN 1 ELSE 0 END)::int AS w,
        sum(CASE WHEN (tm.home_team_id = ft.id AND tm.home_courts_won < tm.visitor_courts_won)
                   OR (tm.visitor_team_id = ft.id AND tm.visitor_courts_won < tm.home_courts_won) THEN 1 ELSE 0 END)::int AS l
      FROM ft
      LEFT JOIN team_matches tm ON tm.home_team_id = ft.id OR tm.visitor_team_id = ft.id
      GROUP BY ft.id, ft.name
    )
    SELECT id, name, coalesce(w,0) w, coalesce(l,0) l, coalesce(cw,0) cw, coalesce(cl,0) cl
    FROM perteam
    ORDER BY coalesce(w,0) DESC, (coalesce(cw,0) - coalesce(cl,0)) DESC, name ASC
  `)) as unknown as StandingRow[];
  return rows;
}

export interface UpcomingMatch {
  matchId: string;
  oppTeamId: string;
  oppName: string;
  date: string | null;
}

// A team's next not-yet-played match (the natural opponent to plan a lineup
// against). Falls back to null when the schedule has no scheduled match.
export async function teamUpcomingMatches(teamId: string): Promise<UpcomingMatch | null> {
  const rows = (await db().execute(sql`
    SELECT tm.id AS "matchId",
      CASE WHEN tm.home_team_id = ${teamId} THEN tm.visitor_team_id ELSE tm.home_team_id END AS "oppTeamId",
      CASE WHEN tm.home_team_id = ${teamId} THEN vt.name ELSE ht.name END AS "oppName",
      coalesce(tm.date_scheduled, tm.played_on) AS d
    FROM team_matches tm
    JOIN teams ht ON ht.id = tm.home_team_id
    JOIN teams vt ON vt.id = tm.visitor_team_id
    WHERE (tm.home_team_id = ${teamId} OR tm.visitor_team_id = ${teamId})
      AND tm.status = 'scheduled'
    ORDER BY coalesce(tm.date_scheduled, tm.played_on) ASC NULLS LAST
    LIMIT 1
  `)) as unknown as Array<{ matchId: string; oppTeamId: string; oppName: string; d: string | null }>;
  const r = rows[0];
  if (!r) return null;
  return { matchId: r.matchId, oppTeamId: r.oppTeamId, oppName: r.oppName, date: r.d ? new Date(r.d).toISOString().slice(0, 10) : null };
}

export interface RosterPlayerRow {
  id: string;
  name: string;
  perf: number | null;
  band: number | null;
  // Hidden per-kind ratings (optimizer-only; never shown on main pages).
  singles: number | null;
  doubles: number | null;
  singlesMatches: number;
  doublesMatches: number;
}

export interface TeamDetailData {
  id: string;
  name: string;
  flightName: string;
  league: string;
  year: number;
  record: { w: number; l: number; cw: number; cl: number };
  roster: RosterPlayerRow[];
  schedule: Array<{ matchId: string; at: "vs" | "@"; opp: string; cw: number; cl: number; date: string | null; won: boolean }>;
}

// Distinct courts (kind + line) actually played in a flight — the empirical
// court set used to resolve a league's format robustly.
export async function flightCourts(
  flightId: string
): Promise<Array<{ kind: "S" | "D"; index: number }>> {
  const rows = (await db().execute(sql`
    SELECT DISTINCT cm.court_kind AS kind, cm.line AS index
    FROM court_matches cm
    JOIN team_matches tm ON tm.id = cm.team_match_id
    JOIN teams t ON t.id = tm.home_team_id
    JOIN subflights sf ON sf.id = t.subflight_id
    WHERE sf.flight_id = ${flightId}
  `)) as unknown as Array<{ kind: "S" | "D"; index: number }>;
  return rows.map((r) => ({ kind: r.kind, index: Number(r.index) }));
}

export interface PlayerLineHistory {
  playerId: string;
  // Courts this player has played, e.g. "D1", desc by count.
  spots: Array<{ court: string; count: number }>;
  total: number;
}

// How often each player on a team has played at each court (kind+line) — the
// signal for projecting where an opponent's players are likely to line up.
export async function teamLineupHistory(
  teamId: string
): Promise<Map<string, PlayerLineHistory>> {
  const rows = (await db().execute(sql`
    SELECT pid, kind, line, count(*)::int AS n FROM (
      SELECT unnest(ARRAY[cm.home_player1_id, cm.home_player2_id]) AS pid,
             cm.court_kind AS kind, cm.line AS line
      FROM court_matches cm JOIN team_matches tm ON tm.id = cm.team_match_id
      WHERE tm.home_team_id = ${teamId}
      UNION ALL
      SELECT unnest(ARRAY[cm.visitor_player1_id, cm.visitor_player2_id]) AS pid,
             cm.court_kind AS kind, cm.line AS line
      FROM court_matches cm JOIN team_matches tm ON tm.id = cm.team_match_id
      WHERE tm.visitor_team_id = ${teamId}
    ) s WHERE pid IS NOT NULL
    GROUP BY pid, kind, line
  `)) as unknown as Array<{ pid: string; kind: "S" | "D"; line: number; n: number }>;
  const map = new Map<string, PlayerLineHistory>();
  for (const r of rows) {
    const court = `${r.kind}${r.line}`;
    let e = map.get(r.pid);
    if (!e) {
      e = { playerId: r.pid, spots: [], total: 0 };
      map.set(r.pid, e);
    }
    e.spots.push({ court, count: r.n });
    e.total += r.n;
  }
  for (const e of map.values()) e.spots.sort((a, b) => b.count - a.count);
  return map;
}

export async function teamDetail(teamId: string): Promise<TeamDetailData | null> {
  const meta = (await db().execute(sql`
    SELECT t.id, t.name, t.year, f.name AS flight, l.name AS league
    FROM teams t
    JOIN subflights sf ON sf.id = t.subflight_id
    JOIN flights f ON f.id = sf.flight_id
    JOIN leagues l ON l.id = f.league_id
    WHERE t.id = ${teamId} LIMIT 1
  `)) as unknown as Array<{ id: string; name: string; year: number; flight: string; league: string }>;
  const m = meta[0];
  if (!m) return null;

  // Roster: distinct players who appeared on this team's side of a court.
  const roster = (await db().execute(sql`
    SELECT p.id, p.display_name AS name, ppr.display AS perf, p.published_ntrp AS band,
           ppr.singles, ppr.doubles,
           coalesce(ppr.singles_matches, 0)::int AS "singlesMatches",
           coalesce(ppr.doubles_matches, 0)::int AS "doublesMatches"
    FROM (
      SELECT DISTINCT pid FROM (
        SELECT unnest(ARRAY[cm.home_player1_id, cm.home_player2_id]) AS pid
        FROM court_matches cm JOIN team_matches tm ON tm.id = cm.team_match_id
        WHERE tm.home_team_id = ${teamId}
        UNION
        SELECT unnest(ARRAY[cm.visitor_player1_id, cm.visitor_player2_id]) AS pid
        FROM court_matches cm JOIN team_matches tm ON tm.id = cm.team_match_id
        WHERE tm.visitor_team_id = ${teamId}
      ) s WHERE pid IS NOT NULL
    ) rp
    JOIN players p ON p.id = rp.pid
    LEFT JOIN player_perf_ratings ppr ON ppr.player_id = p.id
    ORDER BY ppr.display DESC NULLS LAST, p.display_name
  `)) as unknown as RosterPlayerRow[];

  const sched = (await db().execute(sql`
    SELECT tm.id AS "matchId", tm.played_on AS played,
      CASE WHEN tm.home_team_id = ${teamId} THEN 'vs' ELSE '@' END AS at,
      CASE WHEN tm.home_team_id = ${teamId} THEN vt.name ELSE ht.name END AS opp,
      CASE WHEN tm.home_team_id = ${teamId} THEN tm.home_courts_won ELSE tm.visitor_courts_won END AS cw,
      CASE WHEN tm.home_team_id = ${teamId} THEN tm.visitor_courts_won ELSE tm.home_courts_won END AS cl
    FROM team_matches tm
    JOIN teams ht ON ht.id = tm.home_team_id
    JOIN teams vt ON vt.id = tm.visitor_team_id
    WHERE tm.home_team_id = ${teamId} OR tm.visitor_team_id = ${teamId}
    ORDER BY tm.played_on ASC NULLS LAST
  `)) as unknown as Array<{ matchId: string; played: string | null; at: "vs" | "@"; opp: string; cw: number; cl: number }>;

  let w = 0, l = 0, cw = 0, cl = 0;
  const schedule = sched.map((s) => {
    cw += s.cw; cl += s.cl;
    const won = s.cw > s.cl;
    if (s.cw > s.cl) w += 1; else if (s.cw < s.cl) l += 1;
    return { matchId: s.matchId, at: s.at, opp: s.opp, cw: s.cw, cl: s.cl, date: s.played ? new Date(s.played).toISOString().slice(0, 10) : null, won };
  });

  return {
    id: m.id, name: m.name, flightName: m.flight, league: m.league, year: m.year,
    record: { w, l, cw, cl },
    roster: roster.map((r) => ({
      id: r.id,
      name: r.name,
      perf: r.perf,
      band: r.band,
      singles: r.singles,
      doubles: r.doubles,
      singlesMatches: r.singlesMatches,
      doublesMatches: r.doublesMatches,
    })),
    schedule,
  };
}

export interface MatchDetailData {
  date: string | null;
  flight: string;
  league: string;
  home: string;
  away: string;
  homeCourts: number;
  awayCourts: number;
  courts: Array<{
    c: string; type: string;
    home: Array<{ name: string; perf: number | null }>;
    away: Array<{ name: string; perf: number | null }>;
    sets: Array<[number, number]>;
    homeWon: boolean;
  }>;
}

export async function matchDetail(teamMatchId: string): Promise<MatchDetailData | null> {
  const meta = (await db().execute(sql`
    SELECT tm.played_on AS played, ht.name AS home, vt.name AS away,
      tm.home_courts_won AS hcw, tm.visitor_courts_won AS vcw,
      f.name AS flight, l.name AS league
    FROM team_matches tm
    JOIN teams ht ON ht.id = tm.home_team_id
    JOIN teams vt ON vt.id = tm.visitor_team_id
    JOIN subflights sf ON sf.id = ht.subflight_id
    JOIN flights f ON f.id = sf.flight_id
    JOIN leagues l ON l.id = f.league_id
    WHERE tm.id = ${teamMatchId} LIMIT 1
  `)) as unknown as Array<{ played: string | null; home: string; away: string; hcw: number; vcw: number; flight: string; league: string }>;
  const m = meta[0];
  if (!m) return null;

  const courts = (await db().execute(sql`
    SELECT cm.court_kind AS kind, cm.line, cm.sets, cm.home_won AS "homeWon",
      h1.display_name AS h1, h2.display_name AS h2, v1.display_name AS v1, v2.display_name AS v2,
      pr1.display AS h1p, pr2.display AS h2p, pv1.display AS v1p, pv2.display AS v2p
    FROM court_matches cm
    LEFT JOIN players h1 ON h1.id = cm.home_player1_id
    LEFT JOIN players h2 ON h2.id = cm.home_player2_id
    LEFT JOIN players v1 ON v1.id = cm.visitor_player1_id
    LEFT JOIN players v2 ON v2.id = cm.visitor_player2_id
    LEFT JOIN player_perf_ratings pr1 ON pr1.player_id = cm.home_player1_id
    LEFT JOIN player_perf_ratings pr2 ON pr2.player_id = cm.home_player2_id
    LEFT JOIN player_perf_ratings pv1 ON pv1.player_id = cm.visitor_player1_id
    LEFT JOIN player_perf_ratings pv2 ON pv2.player_id = cm.visitor_player2_id
    WHERE cm.team_match_id = ${teamMatchId}
    ORDER BY cm.court_kind, cm.line
  `)) as unknown as Array<{
    kind: "S" | "D"; line: number; sets: unknown; homeWon: boolean;
    h1: string | null; h2: string | null; v1: string | null; v2: string | null;
    h1p: number | null; h2p: number | null; v1p: number | null; v2p: number | null;
  }>;

  return {
    date: m.played ? new Date(m.played).toISOString().slice(0, 10) : null,
    flight: m.flight, league: m.league, home: m.home, away: m.away,
    homeCourts: m.hcw, awayCourts: m.vcw,
    courts: courts.map((c) => {
      const sets = ((c.sets as Array<{ home: number; visitor: number }>) ?? []).map((s) => [s.home, s.visitor] as [number, number]);
      const home = [c.h1 ? { name: c.h1, perf: c.h1p } : null, c.h2 ? { name: c.h2, perf: c.h2p } : null].filter(Boolean) as Array<{ name: string; perf: number | null }>;
      const away = [c.v1 ? { name: c.v1, perf: c.v1p } : null, c.v2 ? { name: c.v2, perf: c.v2p } : null].filter(Boolean) as Array<{ name: string; perf: number | null }>;
      return { c: `${c.kind}${c.line}`, type: c.kind === "S" ? "Singles" : "Doubles", home, away, sets, homeWon: c.homeWon };
    }),
  };
}

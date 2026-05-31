// Server side of the global scope filter. Builds the Section › Season › League
// › Flight tree (with distinct-player counts at every level) and produces the
// SQL participation predicate that rescopes player queries.
//
// A player is "in scope" if they appear in any court of a team match belonging
// to a flight/league/season/section that matches the selection — joined via
// court_matches → team_matches → teams → subflights → flights → leagues.

import "server-only";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@tennis/db";
import { sql, type SQL } from "drizzle-orm";
import { players } from "@tennis/db";
import { EMPTY_SCOPE, SCOPE_COOKIE, type Scope, type ScopeTree, type ScopeNode } from "./scopeShared";

let _db: ReturnType<typeof createClient> | undefined;
function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = createClient(url);
  }
  return _db;
}

const SECTION_LABEL: Record<string, string> = {
  "USTA/NO. CALIFORNIA": "USTA NorCal",
};
const prettySection = (code: string) => SECTION_LABEL[code] ?? code;

interface GroupRow {
  section: string | null;
  season: number | null;
  league_id: string | null;
  league_name: string | null;
  flight_id: string | null;
  flight_name: string | null;
  players: number;
}

// One GROUPING SETS query yields accurate distinct-player counts at each level
// (summing flight counts would double-count players in multiple flights).
async function buildScopeTree(): Promise<ScopeTree> {
  const rows = (await db().execute(sql`
    SELECT l.section_code AS section, l.year AS season,
           l.id AS league_id, l.name AS league_name,
           f.id AS flight_id, f.name AS flight_name,
           count(DISTINCT v.pid)::int AS players
    FROM court_matches cm
    JOIN team_matches tm ON tm.id = cm.team_match_id
    JOIN teams t ON t.id = tm.home_team_id
    JOIN subflights sf ON sf.id = t.subflight_id
    JOIN flights f ON f.id = sf.flight_id
    JOIN leagues l ON l.id = f.league_id
    CROSS JOIN LATERAL (VALUES
      (cm.home_player1_id), (cm.home_player2_id),
      (cm.visitor_player1_id), (cm.visitor_player2_id)) AS v(pid)
    WHERE v.pid IS NOT NULL
      AND l.name NOT ILIKE '%default match%'
    GROUP BY GROUPING SETS (
      (),
      (l.section_code),
      (l.section_code, l.year),
      (l.section_code, l.year, l.id, l.name),
      (l.section_code, l.year, l.id, l.name, f.id, f.name)
    )
  `)) as unknown as GroupRow[];

  let total = 0;
  const sections = new Map<string, ScopeNode & { seasons: Map<string, ScopeNode & { leagues: Map<string, ScopeNode & { flights: ScopeNode[] }> }> }>();

  for (const r of rows) {
    if (r.section == null) { total = r.players; continue; }
    let sec = sections.get(r.section);
    if (!sec) {
      sec = { id: r.section, name: prettySection(r.section), n: 0, seasons: new Map() };
      sections.set(r.section, sec);
    }
    if (r.season == null) { sec.n = r.players; continue; }
    const seasonId = String(r.season);
    let ssn = sec.seasons.get(seasonId);
    if (!ssn) {
      ssn = { id: seasonId, name: seasonId, n: 0, leagues: new Map() };
      sec.seasons.set(seasonId, ssn);
    }
    if (r.league_id == null) { ssn.n = r.players; continue; }
    let lg = ssn.leagues.get(r.league_id);
    if (!lg) {
      lg = { id: r.league_id, name: r.league_name ?? r.league_id, n: 0, flights: [] };
      ssn.leagues.set(r.league_id, lg);
    }
    if (r.flight_id == null) { lg.n = r.players; continue; }
    lg.flights.push({ id: r.flight_id, name: r.flight_name ?? r.flight_id, n: r.players });
  }

  // Assemble + sort every level alphabetically ascending (numeric-aware, so
  // "3.5" < "10.0" and 2025 < 2026).
  const byName = (a: ScopeNode, b: ScopeNode) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const sectionNodes: ScopeNode[] = [...sections.values()]
    .map((sec) => ({
      id: sec.id, name: sec.name, n: sec.n,
      children: [...sec.seasons.values()]
        .map((ssn) => ({
          id: ssn.id, name: ssn.name, n: ssn.n,
          children: [...ssn.leagues.values()]
            .map((lg) => ({ id: lg.id, name: lg.name, n: lg.n, children: lg.flights.sort(byName) }))
            .sort(byName),
        }))
        .sort(byName),
    }))
    .sort(byName);

  return { total, sections: sectionNodes };
}

// Read the current scope from the cookie (server-side). Survives all navigation.
export async function getScopeFromCookies(): Promise<Scope> {
  try {
    const raw = (await cookies()).get(SCOPE_COOKIE)?.value;
    if (!raw) return { ...EMPTY_SCOPE };
    const o = JSON.parse(decodeURIComponent(raw)) as Partial<Scope>;
    return {
      section: o.section ?? null,
      season: o.season ?? null,
      league: o.league ?? null,
      flight: o.flight ?? null,
    };
  } catch {
    return { ...EMPTY_SCOPE };
  }
}

// Cached so the layout doesn't re-aggregate on every navigation. Counts shift
// only when the nightly recompute runs, so a few minutes of staleness is fine.
export const getScopeTree = unstable_cache(buildScopeTree, ["mm-scope-tree-v1"], {
  revalidate: 600,
  tags: ["scope-tree"],
});

// Player-participation predicate, as a NON-correlated `id IN (...)` semi-join:
// the in-scope player set is computed once (filtered by the scope) and hashed,
// rather than a correlated EXISTS evaluated per player row (which was O(players
// × matches) and took ~90s). Returns null when nothing is scoped.
export function scopePlayerFilter(scope: Scope): SQL | null {
  const conds: SQL[] = [];
  if (scope.section) conds.push(sql`l.section_code = ${scope.section}`);
  if (scope.season) conds.push(sql`l.year = ${Number(scope.season)}`);
  if (scope.league) conds.push(sql`l.id = ${scope.league}`);
  if (scope.flight) conds.push(sql`f.id = ${scope.flight}`);
  if (conds.length === 0) return null;
  const extra = sql.join(conds, sql` AND `);
  return sql`${players.id} IN (
    SELECT v.pid
    FROM court_matches cm
    JOIN team_matches tm ON tm.id = cm.team_match_id
    JOIN teams t ON t.id = tm.home_team_id
    JOIN subflights sf ON sf.id = t.subflight_id
    JOIN flights f ON f.id = sf.flight_id
    JOIN leagues l ON l.id = f.league_id
    CROSS JOIN LATERAL (VALUES
      (cm.home_player1_id), (cm.home_player2_id),
      (cm.visitor_player1_id), (cm.visitor_player2_id)) AS v(pid)
    WHERE v.pid IS NOT NULL AND ${extra}
  )`;
}

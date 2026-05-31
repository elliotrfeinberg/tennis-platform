// Phase-2 normalization: turn raw_scorecards (staged parsed scorecards) into
// the relational schema — section → league → flight → subflight → team,
// team_matches, court_matches — resolving court players to player rows.
//
// Pure DB→DB transform (no crawling), so it can be re-run freely as the
// parser / heuristics improve. Idempotent: every insert is conflict-guarded.
//
// Simplifications (refine later):
//  - Subflight grouping isn't in the scorecard, so we use ONE synthetic
//    subflight per flight (the team-name letter A/B/C distinguishes clubs'
//    multiple teams, not subflights).
//  - Players are matched by displayName within the section; unmatched names
//    get a new player row (court players aren't always in the rating dump).

import {
  createClient,
  sections,
  leagues,
  flights,
  subflights,
  teams,
  teamMatches,
  courtMatches,
  players,
  rawScorecards,
} from "@tennis/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  genderWord,
  parseTeamCode,
  type Gender,
} from "./ingestUtils.js";

const SECTION = "USTA/NO. CALIFORNIA";

interface ParsedCourt {
  kind: "S" | "D";
  line: number;
  sets: Array<{ home: number; visitor: number }>;
  homeWon: boolean | undefined;
  homePlayers: string[];
  visitorPlayers: string[];
}
interface ParsedScorecardJson {
  header: {
    league?: string;
    homeTeamName: string;
    visitorTeamName: string;
  };
  courts: ParsedCourt[];
}
interface RawRow {
  ustaMatchId: string;
  year: number;
  playedOn: Date | null;
  parsed: ParsedScorecardJson;
  homeTeamName: string | null;
  visitorTeamName: string | null;
  league: string | null;
}

export async function normalizeMatches(opts: {
  databaseUrl: string;
  limit: number;
}): Promise<void> {
  const db = createClient(opts.databaseUrl);

  // Section anchor.
  await db
    .insert(sections)
    .values({ code: SECTION, displayName: SECTION })
    .onConflictDoNothing();

  // Preload player name -> id (lowercased displayName) for the section.
  const playerCache = new Map<string, string>();
  for (const p of await db
    .select({ id: players.id, name: players.displayName })
    .from(players)
    .where(eq(players.sectionCode, SECTION))) {
    const k = p.name.toLowerCase();
    if (!playerCache.has(k)) playerCache.set(k, p.id);
  }

  const leagueCache = new Map<string, string>();
  const flightCache = new Map<string, string>();
  const subflightCache = new Map<string, string>();
  const teamCache = new Map<string, string>();

  const getLeague = async (year: number, name: string): Promise<string> => {
    const key = `${year}|${name}`;
    const hit = leagueCache.get(key);
    if (hit) return hit;
    const ins = await db
      .insert(leagues)
      .values({ sectionCode: SECTION, year, name })
      .onConflictDoNothing()
      .returning({ id: leagues.id });
    let id = ins[0]?.id;
    if (!id) {
      const sel = await db
        .select({ id: leagues.id })
        .from(leagues)
        .where(and(eq(leagues.sectionCode, SECTION), eq(leagues.year, year), eq(leagues.name, name)));
      id = sel[0]!.id;
    }
    leagueCache.set(key, id);
    return id;
  };

  const getFlight = async (
    leagueId: string,
    name: string,
    gender: Gender,
    ntrp: number
  ): Promise<string> => {
    const key = `${leagueId}|${name}`;
    const hit = flightCache.get(key);
    if (hit) return hit;
    const ins = await db
      .insert(flights)
      .values({ leagueId, name, gender, ntrpLevel: ntrp })
      .onConflictDoNothing()
      .returning({ id: flights.id });
    let id = ins[0]?.id;
    if (!id) {
      const sel = await db
        .select({ id: flights.id })
        .from(flights)
        .where(and(eq(flights.leagueId, leagueId), eq(flights.name, name)));
      id = sel[0]!.id;
    }
    flightCache.set(key, id);
    return id;
  };

  const getSubflight = async (
    flightId: string,
    name: string
  ): Promise<string> => {
    const key = `${flightId}|${name}`;
    const hit = subflightCache.get(key);
    if (hit) return hit;
    const ins = await db
      .insert(subflights)
      .values({ flightId, name })
      .onConflictDoNothing()
      .returning({ id: subflights.id });
    let id = ins[0]?.id;
    if (!id) {
      const sel = await db
        .select({ id: subflights.id })
        .from(subflights)
        .where(and(eq(subflights.flightId, flightId), eq(subflights.name, name)));
      id = sel[0]!.id;
    }
    subflightCache.set(key, id);
    return id;
  };

  const getTeam = async (
    name: string,
    year: number,
    subflightId: string
  ): Promise<string> => {
    const key = `${name}|${year}`;
    const hit = teamCache.get(key);
    if (hit) return hit;
    const ins = await db
      .insert(teams)
      .values({ name, year, subflightId })
      .onConflictDoNothing()
      .returning({ id: teams.id });
    let id = ins[0]?.id;
    if (!id) {
      const sel = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.name, name), eq(teams.year, year)));
      id = sel[0]!.id;
    }
    teamCache.set(key, id);
    return id;
  };

  // Resolve (or create) a team for a scorecard side.
  const resolveTeam = async (
    teamName: string,
    year: number,
    leagueName: string
  ): Promise<string> => {
    const code = parseTeamCode(teamName) ?? {
      division: 0,
      gender: "X" as Gender,
      ntrp: 0,
    };
    const leagueId = await getLeague(year, leagueName);
    const flightName = `${genderWord(code.gender)} ${code.ntrp.toFixed(1)}`;
    const flightId = await getFlight(
      leagueId,
      flightName,
      code.gender,
      code.ntrp
    );
    const subflightId = await getSubflight(flightId, flightName);
    return getTeam(teamName, year, subflightId);
  };

  const resolvePlayer = async (
    name: string,
    gender: Gender
  ): Promise<string | null> => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return null;
    const k = clean.toLowerCase();
    const hit = playerCache.get(k);
    if (hit) return hit;
    const ins = await db
      .insert(players)
      .values({
        displayName: clean,
        sectionCode: SECTION,
        gender: gender === "X" ? null : gender,
      })
      .returning({ id: players.id });
    const id = ins[0]!.id;
    playerCache.set(k, id);
    return id;
  };

  const staged = (await db
    .select({
      ustaMatchId: rawScorecards.ustaMatchId,
      year: rawScorecards.year,
      playedOn: rawScorecards.playedOn,
      parsed: rawScorecards.parsed,
      homeTeamName: rawScorecards.homeTeamName,
      visitorTeamName: rawScorecards.visitorTeamName,
      league: rawScorecards.league,
    })
    .from(rawScorecards)) as unknown as RawRow[];

  let teamMatchCount = 0;
  let courtCount = 0;
  let skippedCourts = 0;
  let processed = 0;
  for (const r of staged) {
    if (processed >= opts.limit) break;
    processed += 1;
    const parsed = r.parsed;
    const leagueName = (r.league ?? parsed.header.league ?? "Unknown").trim();
    const homeName = (r.homeTeamName ?? parsed.header.homeTeamName).trim();
    const visitorName = (
      r.visitorTeamName ?? parsed.header.visitorTeamName
    ).trim();
    const flightGender =
      parseTeamCode(homeName)?.gender ??
      parseTeamCode(visitorName)?.gender ??
      "X";

    const homeTeamId = await resolveTeam(homeName, r.year, leagueName);
    const visitorTeamId = await resolveTeam(visitorName, r.year, leagueName);

    let homeWins = 0;
    let visitorWins = 0;
    for (const c of parsed.courts) {
      if (c.homeWon === true) homeWins += 1;
      else if (c.homeWon === false) visitorWins += 1;
    }

    const tmIns = await db
      .insert(teamMatches)
      .values({
        ustaMatchId: r.ustaMatchId,
        homeTeamId,
        visitorTeamId,
        playedOn: r.playedOn ?? new Date(r.year, 0, 1),
        status: homeWins + visitorWins > 0 ? "completed" : "scheduled",
        homeCourtsWon: homeWins,
        visitorCourtsWon: visitorWins,
        sourceUrl: null,
      })
      .onConflictDoNothing()
      .returning({ id: teamMatches.id });
    let teamMatchId = tmIns[0]?.id;
    if (!teamMatchId) {
      const sel = await db
        .select({ id: teamMatches.id })
        .from(teamMatches)
        .where(eq(teamMatches.ustaMatchId, r.ustaMatchId));
      teamMatchId = sel[0]!.id;
    }
    teamMatchCount += 1;

    for (const c of parsed.courts) {
      if (c.homeWon === undefined) {
        skippedCourts += 1;
        continue;
      }
      const h1 = await resolvePlayer(c.homePlayers[0] ?? "", flightGender);
      const v1 = await resolvePlayer(c.visitorPlayers[0] ?? "", flightGender);
      if (!h1 || !v1) {
        skippedCourts += 1;
        continue;
      }
      const h2 =
        c.kind === "D" && c.homePlayers[1]
          ? await resolvePlayer(c.homePlayers[1]!, flightGender)
          : null;
      const v2 =
        c.kind === "D" && c.visitorPlayers[1]
          ? await resolvePlayer(c.visitorPlayers[1]!, flightGender)
          : null;
      await db
        .insert(courtMatches)
        .values({
          teamMatchId,
          courtKind: c.kind,
          line: c.line,
          homePlayer1Id: h1,
          homePlayer2Id: h2,
          visitorPlayer1Id: v1,
          visitorPlayer2Id: v2,
          sets: c.sets,
          homeWon: c.homeWon,
          completed: true,
        })
        .onConflictDoNothing();
      courtCount += 1;
    }
  }

  console.error(
    `Normalized ${processed} scorecards → ${teamMatchCount} team_matches, ` +
      `${courtCount} court_matches (${skippedCourts} courts skipped: no winner/players).`
  );

  const splitFlights = await splitSubflightsByConnectivity(db);
  console.error(
    `Subflights: split ${splitFlights} flight(s) into real pods by match connectivity.`
  );

  await (
    db as unknown as { $client: { end: () => Promise<void> } }
  ).$client.end();
}

// Post-pass: a USTA subflight is the round-robin pod teams actually play in, so
// derive it from connectivity — teams linked (directly or transitively) by a
// team_match are one subflight. Flights that are a single connected pod keep
// their lone (flight-named) subflight; multi-pod flights split into
// "<flight> · N" subflights (provisional names until the subflight crawl
// supplies the real "… - DN 1"). Idempotent: deterministic numbering by each
// pod's alphabetically-first team, reused via the (flightId,name) unique index.
async function splitSubflightsByConnectivity(
  db: ReturnType<typeof createClient>
): Promise<number> {
  const flightRows = (await db.execute(sql`SELECT id, name FROM flights`)) as unknown as Array<{ id: string; name: string }>;
  const flightName = new Map(flightRows.map((f) => [f.id, f.name]));

  const teamRows = (await db.execute(sql`
    SELECT t.id, t.name, sf.flight_id AS "flightId"
    FROM teams t JOIN subflights sf ON sf.id = t.subflight_id
  `)) as unknown as Array<{ id: string; name: string; flightId: string }>;

  const edgeRows = (await db.execute(sql`
    SELECT home_team_id AS a, visitor_team_id AS b FROM team_matches
  `)) as unknown as Array<{ a: string; b: string }>;

  // Union-find over all team ids.
  const parent = new Map<string, string>();
  for (const t of teamRows) parent.set(t.id, t.id);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of edgeRows) if (parent.has(e.a) && parent.has(e.b)) union(e.a, e.b);

  // Flights whose subflights the crawl has already given real names ("… - DN 1")
  // are left untouched — re-splitting would clobber those crawled names.
  const namedFlights = new Set(
    (
      (await db.execute(sql`
        SELECT DISTINCT flight_id AS "flightId" FROM subflights WHERE reach_par1 IS NOT NULL
      `)) as unknown as Array<{ flightId: string }>
    ).map((r) => r.flightId)
  );

  // Group teams by flight, then by component root.
  const byFlight = new Map<string, Array<{ id: string; name: string }>>();
  for (const t of teamRows) {
    const arr = byFlight.get(t.flightId) ?? [];
    arr.push({ id: t.id, name: t.name });
    byFlight.set(t.flightId, arr);
  }

  let splitCount = 0;
  for (const [flightId, ts] of byFlight) {
    if (namedFlights.has(flightId)) continue; // preserve crawled subflight names
    const comps = new Map<string, string[]>();
    const compName = new Map<string, string>(); // root -> alphabetically-first team name
    for (const t of ts) {
      const r = find(t.id);
      (comps.get(r) ?? comps.set(r, []).get(r)!).push(t.id);
      const cur = compName.get(r);
      if (cur === undefined || t.name < cur) compName.set(r, t.name);
    }
    if (comps.size <= 1) continue; // single pod — leave the synthetic subflight

    const groups = [...comps.entries()]
      .map(([root, ids]) => ({ ids, key: compName.get(root)! }))
      .sort((x, y) => x.key.localeCompare(y.key));

    let n = 1;
    for (const g of groups) {
      const name = `${flightName.get(flightId)} · ${n++}`;
      const ins = await db
        .insert(subflights)
        .values({ flightId, name })
        .onConflictDoNothing()
        .returning({ id: subflights.id });
      let sfId = ins[0]?.id;
      if (!sfId) {
        const sel = await db
          .select({ id: subflights.id })
          .from(subflights)
          .where(and(eq(subflights.flightId, flightId), eq(subflights.name, name)));
        sfId = sel[0]!.id;
      }
      await db.update(teams).set({ subflightId: sfId }).where(inArray(teams.id, g.ids));
    }
    splitCount += 1;
  }

  // Drop empty synthetic subflights we split out of — but never a named
  // (crawled) one, even if momentarily teamless.
  await db.execute(sql`
    DELETE FROM subflights
    WHERE reach_par1 IS NULL
      AND id NOT IN (SELECT DISTINCT subflight_id FROM teams)
  `);
  return splitCount;
}

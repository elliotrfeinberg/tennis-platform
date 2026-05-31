// Subflight crawl: give each flight's connectivity-derived pods their REAL
// USTA names ("Men's 3.5 - DN 1") + authoritative member standings.
//
// For each flight seed (flight_catalog.reachPar1 + reachTeamAnchorId — a known
// team) we render the Team Summary standings view via the browser
// (fetchTeamSummary), parse the subflight name + member teams with the existing
// parseTeamProfile, upsert subflight_catalog, and rename the matching subflight
// pod (the one whose teams are that member set) to the real name.
//
// Coverage note: one flight seed reaches ONE subflight (the seed team's). Full
// per-flight subflight coverage comes from seeding many teams — a follow-on
// broader walk; this first pass names one subflight per cataloged flight.
// Resumable via subflight_enum_visits; paced like the other crawls.

import { createClient } from "@tennis/db";
import {
  flightCatalog,
  subflights,
  subflightCatalog,
  subflightEnumVisits,
  teams,
  playerYearRatings,
} from "@tennis/db";
import {
  BrowserFetcher,
  loadSession,
  parseTeamProfile,
  parsePlayerRecord,
  flightKeyOf,
} from "@tennis/scraper";
import { and, eq, inArray, sql } from "drizzle-orm";

const SECTION = "USTA/NO. CALIFORNIA";
type Db = ReturnType<typeof createClient>;

async function endClient(db: Db): Promise<void> {
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
}

async function upsertCatalog(
  db: Db,
  c: {
    flightKey: string; year: number; league: string; flightName: string;
    subflightName: string; reachPar1: string; reachTeamAnchorId: string;
    reachTeamName: string | undefined; members: string[];
  }
): Promise<void> {
  const subflightKey = `${c.year}|${c.league}|${c.flightName}|${c.subflightName}`;
  await db
    .insert(subflightCatalog)
    .values({
      subflightKey, flightKey: c.flightKey, year: c.year, league: c.league,
      flightName: c.flightName, subflightName: c.subflightName,
      reachPar1: c.reachPar1, reachTeamAnchorId: c.reachTeamAnchorId,
      reachTeamName: c.reachTeamName, memberTeams: c.members, standingsAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subflightCatalog.subflightKey,
      set: {
        memberTeams: c.members, standingsAt: new Date(), reachPar1: c.reachPar1,
        reachTeamAnchorId: c.reachTeamAnchorId, reachTeamName: c.reachTeamName,
      },
    });
}

async function recordVisit(
  db: Db,
  par1: string,
  year: number,
  subflightName: string | null,
  teamsFound: number,
  error: string | null
): Promise<void> {
  await db
    .insert(subflightEnumVisits)
    .values({ par1, year, subflightName, teamsFound, error })
    .onConflictDoUpdate({
      target: subflightEnumVisits.par1,
      set: { subflightName, teamsFound, error, visitedAt: new Date() },
    });
}

// Rename the connectivity pod whose teams are this crawled member set to the
// real subflight name. Returns false if no DB teams match or a name clash.
async function renameMatchingPod(
  db: Db,
  year: number,
  memberNames: string[],
  subName: string,
  par1: string,
  teamName: string | null
): Promise<boolean> {
  const rows = await db
    .select({ sfid: teams.subflightId })
    .from(teams)
    .where(and(eq(teams.year, year), inArray(teams.name, memberNames)));
  if (rows.length === 0) return false;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.sfid, (counts.get(r.sfid) ?? 0) + 1);
  const sfid = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  try {
    await db
      .update(subflights)
      .set({ name: subName, reachPar1: par1, reachYear: year, reachTeamName: teamName })
      .where(eq(subflights.id, sfid));
    return true;
  } catch {
    return false; // unique (flightId,name) clash — leave the provisional name
  }
}

export async function enumerateSubflights(opts: {
  databaseUrl: string;
  year?: number;
  limit?: number;
  minDelayMs: number;
  maxDelayMs: number;
  // Broad mode: walk player records and name every still-unnamed subflight pod
  // (full coverage), instead of the one-subflight-per-flight catalog seed pass.
  walk?: boolean;
  stopAfterBarren?: number;
}): Promise<void> {
  const db = createClient(opts.databaseUrl);
  const session = await loadSession();
  const bf = new BrowserFetcher({
    session,
    minDelayMs: opts.minDelayMs,
    maxDelayMs: opts.maxDelayMs,
  });

  if (opts.walk) {
    await walkPlayers(db, bf, opts);
    await bf.close();
    await endClient(db);
    return;
  }

  // Per-flight resumability: skip flights already cataloged (a single player
  // par1 can seed many flights, so we can't key on par1 alone).
  const done = new Set(
    (await db.select({ k: subflightCatalog.flightKey }).from(subflightCatalog)).map((r) => r.k)
  );
  const base = db
    .select({
      flightKey: flightCatalog.flightKey,
      year: flightCatalog.year,
      league: flightCatalog.league,
      flightName: flightCatalog.flightName,
      reachPar1: flightCatalog.reachPar1,
      reachTeamAnchorId: flightCatalog.reachTeamAnchorId,
    })
    .from(flightCatalog);
  const seedRows = opts.year ? await base.where(eq(flightCatalog.year, opts.year)) : await base;
  const seeds = seedRows.filter((s) => !done.has(s.flightKey));
  console.error(
    `Subflight enum: ${seeds.length} unvisited flight seeds (year=${opts.year ?? "all"}).`
  );

  let processed = 0;
  let named = 0;
  let errors = 0;
  for (const s of seeds) {
    if (opts.limit && processed >= opts.limit) break;
    processed += 1;
    try {
      const r = await bf.fetchTeamSummary(s.reachPar1, s.reachTeamAnchorId);
      const p = parseTeamProfile(r.body ?? "");
      const subName = p.header.subFlight?.trim();
      const members = p.standings.map((st) => st.teamName);
      if (!subName || members.length === 0) {
        await recordVisit(db, s.reachPar1, s.year, null, 0, "no subflight/standings parsed");
        console.error(`[${processed}/${seeds.length}] ${s.flightName}: no subflight parsed`);
        continue;
      }
      await upsertCatalog(db, {
        flightKey: s.flightKey, year: s.year, league: s.league, flightName: s.flightName,
        subflightName: subName, reachPar1: s.reachPar1, reachTeamAnchorId: s.reachTeamAnchorId,
        reachTeamName: p.header.teamName, members,
      });
      const did = await renameMatchingPod(db, s.year, members, subName, s.reachPar1, p.header.teamName ?? null);
      if (did) named += 1;
      await recordVisit(db, s.reachPar1, s.year, subName, members.length, null);
      console.error(
        `[${processed}/${seeds.length}] ${s.flightName} → ${subName} (${members.length} teams)${did ? " ✓renamed" : ""}`
      );
    } catch (e) {
      errors += 1;
      await recordVisit(db, s.reachPar1, s.year, null, 0, String(e).slice(0, 200));
      console.error(`[${processed}/${seeds.length}] ${s.flightName}: ERROR ${String(e).slice(0, 120)}`);
    }
  }
  console.error(`Done: processed ${processed}, named ${named}, errors ${errors}.`);
  await bf.close();
  await endClient(db);
}

// Broad coverage: walk player records and, for each team whose subflight pod
// isn't named yet, render its standings view and name it. Covers every
// subflight (a flight seed only reaches one). Resumable (skips walked players)
// and self-terminating once a run of players yields no new names.
async function walkPlayers(
  db: Db,
  bf: BrowserFetcher,
  opts: { year?: number; limit?: number; stopAfterBarren?: number }
): Promise<void> {
  const walked = new Set(
    (await db.select({ p: subflightEnumVisits.par1 }).from(subflightEnumVisits)).map((r) => r.p)
  );
  const candRows = (await db.execute(sql`
    SELECT DISTINCT tennislink_par1 AS par1 FROM player_year_ratings
    WHERE tennislink_par1 IS NOT NULL ${opts.year ? sql`AND year = ${opts.year}` : sql``}
    ORDER BY random()
  `)) as unknown as Array<{ par1: string }>;
  const players = candRows.filter((c) => !walked.has(c.par1));
  const stopBarren = opts.stopAfterBarren ?? 150;
  console.error(`Subflight walk: ${players.length} unwalked players (year=${opts.year ?? "all"}).`);

  let processed = 0;
  let named = 0;
  let barren = 0;
  for (const pl of players) {
    if (opts.limit && processed >= opts.limit) break;
    if (barren >= stopBarren) {
      console.error(`Stopping: ${barren} consecutive players named no new subflight.`);
      break;
    }
    processed += 1;
    let namedThis = 0;
    try {
      const rec = await bf.fetchPlayerRecord(pl.par1);
      const parsed = parsePlayerRecord(rec.body ?? "");
      for (const t of parsed.teams) {
        if (!t.year || (opts.year && t.year !== opts.year)) continue;
        if (t.section && t.section !== SECTION) continue;
        if (!t.league || !t.flight) continue;
        const trow = (
          await db
            .select({ named: subflights.reachPar1 })
            .from(teams)
            .innerJoin(subflights, eq(subflights.id, teams.subflightId))
            .where(and(eq(teams.name, t.teamName), eq(teams.year, t.year)))
        )[0];
        if (!trow || trow.named) continue; // unknown team, or pod already named
        const r = await bf.fetchTeamSummary(pl.par1, t.teamAnchorId);
        const p = parseTeamProfile(r.body ?? "");
        const subName = p.header.subFlight?.trim();
        const members = p.standings.map((st) => st.teamName);
        if (!subName || members.length === 0) continue;
        await upsertCatalog(db, {
          flightKey: flightKeyOf(t.year, t.league, t.flight), year: t.year, league: t.league,
          flightName: t.flight, subflightName: subName, reachPar1: pl.par1,
          reachTeamAnchorId: t.teamAnchorId, reachTeamName: p.header.teamName, members,
        });
        if (await renameMatchingPod(db, t.year, members, subName, pl.par1, p.header.teamName ?? null)) {
          named += 1;
          namedThis += 1;
        }
      }
      await recordVisit(db, pl.par1, opts.year ?? 0, null, namedThis, null);
    } catch (e) {
      await recordVisit(db, pl.par1, opts.year ?? 0, null, 0, String(e).slice(0, 200));
    }
    barren = namedThis === 0 ? barren + 1 : 0;
    if (processed % 10 === 0 || namedThis > 0) {
      console.error(`[${processed}/${players.length}] +${namedThis} subflights (total ${named}, barren ${barren})`);
    }
  }
  console.error(`Walk done: ${processed} players, ${named} subflights named.`);
}

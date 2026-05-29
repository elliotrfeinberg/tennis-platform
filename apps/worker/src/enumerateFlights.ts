// Phase-2 flight enumeration.
//
// USTA exposes no "list all flights" endpoint. A flight's complete Match
// Summary is only reachable by starting from a *player* (a rating-search par1
// token → the t=T-0 "Individual Player Record" page), clicking one of that
// player's teams, the Flight tab, then the flight-level Match Summary. So we
// DISCOVER flights by walking players (we already have ~20k par1 tokens in
// player_year_ratings) and dedupe them into flight_catalog. For each newly
// seen flight we immediately scrape its Match Summary (every match + date)
// into flight_matches — the cheap canonical match index that feeds the
// scorecard backfill and drives phase-3 incremental.
//
// The walk is resumable (flight_enum_visits records every par1 we've loaded)
// and self-terminating (stops after a run of players that surface no new
// flight — coverage has saturated). A separate backfillFlightMatches() can
// re-scrape catalogued flights whose Match Summary fetch failed or is stale.

import { createClient } from "@tennis/db";
import {
  flightCatalog,
  flightMatches,
  flightEnumVisits,
} from "@tennis/db";
import {
  BrowserFetcher,
  loadSession,
  parsePlayerRecord,
  parseMatchSummary,
  flightCodeFromTeamName,
  flightKeyOf,
} from "@tennis/scraper";
import { eq, isNull, sql } from "drizzle-orm";
import { parseUsDate } from "./ingestUtils.js";

type Db = ReturnType<typeof createClient>;

function looksLikeLogin(body: string | null | undefined): boolean {
  if (!body) return false;
  return (
    body.includes("account.usta.com") ||
    body.includes("Sign in to TennisLink") ||
    body.includes("Auth0")
  );
}

async function endClient(db: Db): Promise<void> {
  await (
    db as unknown as { $client: { end: () => Promise<void> } }
  ).$client.end();
}

// Drive a flight's Match Summary and upsert its matches into flight_matches;
// stamp the catalog row with the count + timestamp. Shared by enumerate
// (new flights) and backfill (retry/refresh).
async function scrapeAndStoreFlight(
  db: Db,
  bf: BrowserFetcher,
  row: {
    flightKey: string;
    year: number;
    reachPar1: string;
    reachTeamAnchorId: string;
  }
): Promise<{ matches: number; error?: string }> {
  let ms;
  try {
    ms = await bf.fetchFlightMatchSummary(row.reachPar1, row.reachTeamAnchorId);
  } catch (err) {
    return { matches: 0, error: err instanceof Error ? err.message : String(err) };
  }
  if (looksLikeLogin(ms.body)) {
    throw new LoginExpiredError();
  }
  const parsed = parseMatchSummary(ms.body ?? "");
  let stored = 0;
  for (const m of parsed.rows) {
    await db
      .insert(flightMatches)
      .values({
        ustaMatchId: m.matchId,
        flightKey: row.flightKey,
        year: row.year,
        playedOn: parseUsDate(m.date),
        homeTeam: m.homeTeam ?? null,
        visitorTeam: m.visitorTeam ?? null,
      })
      .onConflictDoNothing();
    stored += 1;
  }
  await db
    .update(flightCatalog)
    .set({ matchCount: parsed.rows.length, matchSummaryAt: new Date() })
    .where(eq(flightCatalog.flightKey, row.flightKey));
  return { matches: parsed.rows.length };
}

class LoginExpiredError extends Error {
  constructor() {
    super("session looks logged-out (page rendered the login wall)");
    this.name = "LoginExpiredError";
  }
}

export async function enumerateFlights(opts: {
  databaseUrl: string;
  limitPlayers: number;
  stopAfterBarren: number;
  minDelayMs: number;
  maxDelayMs: number;
  // Only catalog teams from these season years (a player's record page lists
  // every year they ever played; this skips older flights). Empty = all years.
  years?: number[];
}): Promise<void> {
  const db = createClient(opts.databaseUrl);
  const yearFilter = opts.years && opts.years.length ? new Set(opts.years) : null;
  if (yearFilter) {
    console.error(`Year filter: ${[...yearFilter].sort().join(", ")}`);
  }

  // Existing catalog keys (so we only scrape genuinely new flights).
  const catalog = new Set(
    (await db.select({ k: flightCatalog.flightKey }).from(flightCatalog)).map(
      (r) => r.k
    )
  );
  console.error(`Catalog has ${catalog.size} flights already.`);

  // Candidate players: distinct par1 not yet visited, random order for fast
  // coverage diversity across divisions/levels.
  const candidates = (await db.execute(
    sql`SELECT par1 FROM (
          SELECT DISTINCT pyr.tennislink_par1 AS par1
          FROM player_year_ratings pyr
          WHERE pyr.tennislink_par1 IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM flight_enum_visits v WHERE v.par1 = pyr.tennislink_par1
            )
        ) sub
        ORDER BY random()
        LIMIT ${opts.limitPlayers}`
  )) as unknown as Array<{ par1: string }>;
  console.error(
    `${candidates.length} unvisited players queued (limit ${opts.limitPlayers}).`
  );

  const session = await loadSession();
  const bf = new BrowserFetcher({
    session,
    minDelayMs: opts.minDelayMs,
    maxDelayMs: opts.maxDelayMs,
  });

  let visited = 0;
  let newFlightsTotal = 0;
  let matchesTotal = 0;
  let barren = 0;
  try {
    for (const cand of candidates) {
      const par1 = cand.par1;
      let teamsFound = 0;
      let newFlights = 0;
      let visitError: string | undefined;
      try {
        const rec = await bf.fetchPlayerRecord(par1);
        if (looksLikeLogin(rec.body)) throw new LoginExpiredError();
        const parsed = parsePlayerRecord(rec.body ?? "");
        teamsFound = parsed.teams.length;
        for (const team of parsed.teams) {
          if (team.year === undefined) continue; // can't anchor a flight w/o year
          if (yearFilter && !yearFilter.has(team.year)) continue;
          const key = flightKeyOf(team.year, team.league, team.flight);
          if (catalog.has(key)) continue;
          // Record the catalog row first (so a failed scrape can be retried).
          await db
            .insert(flightCatalog)
            .values({
              flightKey: key,
              year: team.year,
              league: team.league ?? "?",
              flightName: team.flight ?? "?",
              flightCode: flightCodeFromTeamName(team.teamName) ?? null,
              reachPar1: par1,
              reachTeamAnchorId: team.teamAnchorId,
              reachTeamName: team.teamName,
            })
            .onConflictDoNothing();
          catalog.add(key);
          newFlights += 1;
          const res = await scrapeAndStoreFlight(db, bf, {
            flightKey: key,
            year: team.year,
            reachPar1: par1,
            reachTeamAnchorId: team.teamAnchorId,
          });
          matchesTotal += res.matches;
          console.error(
            `  + ${key}  → ${res.matches} matches${
              res.error ? ` (scrape err: ${res.error})` : ""
            }`
          );
        }
      } catch (err) {
        if (err instanceof LoginExpiredError) {
          console.error(
            "\n✗ Session expired mid-run. Stopping cleanly — re-run to resume " +
              "(visited players are recorded). Refresh with: " +
              "tennis-scrape session ensure <account> --force"
          );
          break;
        }
        visitError = err instanceof Error ? err.message : String(err);
        console.error(`  ! ${par1.slice(0, 12)}…: ${visitError}`);
      }

      await db
        .insert(flightEnumVisits)
        .values({ par1, teamsFound, newFlights, error: visitError ?? null })
        .onConflictDoNothing();

      visited += 1;
      newFlightsTotal += newFlights;
      if (newFlights === 0) {
        barren += 1;
        if (barren >= opts.stopAfterBarren) {
          console.error(
            `\nSaturation: ${barren} consecutive players with no new flight. Stopping.`
          );
          break;
        }
      } else {
        barren = 0;
      }
      if (visited % 10 === 0) {
        console.error(
          `[${visited}/${candidates.length}] catalog=${catalog.size} newThisRun=${newFlightsTotal} matches=${matchesTotal} barrenStreak=${barren}`
        );
      }
    }
  } finally {
    await bf.close();
  }

  console.error(
    `\nDone. visited ${visited} players; +${newFlightsTotal} flights (catalog now ${catalog.size}); +${matchesTotal} flight-matches.`
  );
  await endClient(db);
}

// Retry/refresh: scrape Match Summary for catalogued flights that never got
// one (matchSummaryAt IS NULL), or all of them with --refresh.
export async function backfillFlightMatches(opts: {
  databaseUrl: string;
  limit: number;
  refresh: boolean;
  minDelayMs: number;
  maxDelayMs: number;
}): Promise<void> {
  const db = createClient(opts.databaseUrl);
  const base = db
    .select({
      flightKey: flightCatalog.flightKey,
      year: flightCatalog.year,
      reachPar1: flightCatalog.reachPar1,
      reachTeamAnchorId: flightCatalog.reachTeamAnchorId,
    })
    .from(flightCatalog);
  const rows = opts.refresh
    ? await base
    : await base.where(isNull(flightCatalog.matchSummaryAt));
  const targets = rows.slice(0, opts.limit);
  console.error(
    `${rows.length} flights need a Match Summary${
      opts.refresh ? " (refresh: all)" : " (never scraped)"
    }; doing ${targets.length}.`
  );

  const session = await loadSession();
  const bf = new BrowserFetcher({
    session,
    minDelayMs: opts.minDelayMs,
    maxDelayMs: opts.maxDelayMs,
  });
  let ok = 0;
  let matches = 0;
  try {
    for (const row of targets) {
      try {
        const res = await scrapeAndStoreFlight(db, bf, row);
        if (res.error) {
          console.error(`  ! ${row.flightKey}: ${res.error}`);
        } else {
          ok += 1;
          matches += res.matches;
          console.error(`  ✓ ${row.flightKey} → ${res.matches} matches`);
        }
      } catch (err) {
        if (err instanceof LoginExpiredError) {
          console.error("✗ Session expired. Stopping — re-run to resume.");
          break;
        }
        console.error(
          `  ! ${row.flightKey}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  } finally {
    await bf.close();
  }
  console.error(`Done. ${ok} flights scraped, +${matches} matches.`);
  await endClient(db);
}

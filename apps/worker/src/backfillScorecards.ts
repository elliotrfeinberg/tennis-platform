// Phase-2 match backfill (staging step). Reads a Match Summary export
// (parseMatchSummary output: { rows: [{ matchId, date, ... }] }), fetches
// each match's scorecard (t=7, by USTA match id) via the polite fetcher,
// parses it, and upserts the parsed result into the raw_scorecards staging
// table. Decoupled from relational normalization so the slow polite crawl
// runs once and normalization can be re-derived freely.
//
// Resumable: match ids already present in raw_scorecards are skipped.

import { readFile } from "node:fs/promises";
import { createClient, rawScorecards, flightMatches } from "@tennis/db";
import {
  loadSession,
  PoliteFetcher,
  scorecardUrl,
  parseScorecard,
} from "@tennis/scraper";
import { and, eq, sql } from "drizzle-orm";
import { parseUsDate } from "./ingestUtils.js";
import { accountReauth } from "./accountReauth.js";

interface MatchRow {
  matchId: string;
  date?: string;
  homeTeam?: string;
  visitorTeam?: string;
}

export async function backfillScorecards(opts: {
  databaseUrl: string;
  matchesPath: string;
  year: number;
  limit: number;
  minDelayMs: number;
  maxDelayMs: number;
}): Promise<void> {
  const db = createClient(opts.databaseUrl);
  const parsed = JSON.parse(await readFile(opts.matchesPath, "utf8")) as {
    rows: MatchRow[];
  };
  const rows = parsed.rows ?? [];
  console.error(`  ${rows.length} matches in ${opts.matchesPath}`);

  const existing = new Set(
    (
      await db.select({ id: rawScorecards.ustaMatchId }).from(rawScorecards)
    ).map((r) => r.id)
  );

  const session = await loadSession();
  // When running under an account, re-login in-flight if a scorecard fetch
  // bounces to the login page (long crawls can outlive a cookie).
  const fetcher = new PoliteFetcher({
    userAgent: session.userAgent,
    contactEmail: session.contactEmail,
    cookieHeader: session.cookieHeader,
    minDelayMs: opts.minDelayMs,
    maxDelayMs: opts.maxDelayMs,
    reauth: accountReauth(),
  });

  let fetched = 0;
  let skipped = 0;
  let errors = 0;
  for (const m of rows) {
    if (fetched >= opts.limit) break;
    if (existing.has(m.matchId)) {
      skipped += 1;
      continue;
    }
    const url = scorecardUrl({ matchId: m.matchId, year: opts.year });
    try {
      const res = await fetcher.fetch(url);
      if (!res.body) {
        errors += 1;
        console.error(`  ${m.matchId}: empty body (status ${res.status})`);
        continue;
      }
      const sc = parseScorecard(res.body);
      await db
        .insert(rawScorecards)
        .values({
          ustaMatchId: m.matchId,
          year: opts.year,
          sourceUrl: url,
          playedOn: parseUsDate(sc.header.datePlayed) ?? parseUsDate(m.date),
          rawHtml: res.body,
          parsed: sc as unknown as Record<string, unknown>,
          homeTeamName: sc.header.homeTeamName ?? m.homeTeam ?? null,
          visitorTeamName: sc.header.visitorTeamName ?? m.visitorTeam ?? null,
          league: sc.header.league ?? null,
          courtCount: sc.courts.length,
        })
        .onConflictDoNothing();
      fetched += 1;
      if (fetched % 10 === 0) console.error(`  fetched ${fetched}…`);
    } catch (err) {
      errors += 1;
      console.error(
        `  ${m.matchId}: ERROR ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.error(
    `Done. fetched ${fetched}, skipped ${skipped} (already stored), errors ${errors}.`
  );
  await (
    db as unknown as { $client: { end: () => Promise<void> } }
  ).$client.end();
}

// DB-driven variant: pull match ids from flight_matches (populated by flight
// enumeration) instead of a JSON file. Fetches each unfetched match's t=7
// scorecard, upserts raw_scorecards, and flips flight_matches.scorecardFetched.
// This is the wide-crawl path: enumerate-flights → here → normalize-matches.
export async function backfillScorecardsFromDb(opts: {
  databaseUrl: string;
  limit: number;
  year?: number; // optional season filter
  // Disjoint-slice sharding for running K accounts in parallel: each worker
  // takes matches where hash(matchId) % total == index. Deterministic +
  // collision-free across shards, so N polite workers cut wall time by ~N.
  shard?: { index: number; total: number };
  minDelayMs: number;
  maxDelayMs: number;
}): Promise<void> {
  const db = createClient(opts.databaseUrl);
  const conds = [eq(flightMatches.scorecardFetched, false)];
  if (opts.year) conds.push(eq(flightMatches.year, opts.year));
  if (opts.shard) {
    conds.push(
      sql`abs(hashtext(${flightMatches.ustaMatchId})) % ${opts.shard.total} = ${opts.shard.index}`
    );
  }
  const where = and(...conds);
  const pending = await db
    .select({
      matchId: flightMatches.ustaMatchId,
      year: flightMatches.year,
      playedOn: flightMatches.playedOn,
      homeTeam: flightMatches.homeTeam,
      visitorTeam: flightMatches.visitorTeam,
    })
    .from(flightMatches)
    .where(where)
    .limit(opts.limit);
  console.error(
    `${pending.length} unfetched flight_matches${
      opts.year ? ` (year ${opts.year})` : ""
    }${opts.shard ? ` (shard ${opts.shard.index}/${opts.shard.total})` : ""}.`
  );

  // Match ids already present in raw_scorecards: skip the fetch but still mark
  // them fetched in flight_matches (idempotent reconciliation).
  const existing = new Set(
    (
      await db.select({ id: rawScorecards.ustaMatchId }).from(rawScorecards)
    ).map((r) => r.id)
  );

  const session = await loadSession();
  const fetcher = new PoliteFetcher({
    userAgent: session.userAgent,
    contactEmail: session.contactEmail,
    cookieHeader: session.cookieHeader,
    minDelayMs: opts.minDelayMs,
    maxDelayMs: opts.maxDelayMs,
    reauth: accountReauth(),
  });

  let fetched = 0;
  let already = 0;
  let errors = 0;
  for (const m of pending) {
    if (existing.has(m.matchId)) {
      await db
        .update(flightMatches)
        .set({ scorecardFetched: true })
        .where(eq(flightMatches.ustaMatchId, m.matchId));
      already += 1;
      continue;
    }
    const url = scorecardUrl({ matchId: m.matchId, year: m.year });
    try {
      const res = await fetcher.fetch(url);
      if (!res.body) {
        errors += 1;
        console.error(`  ${m.matchId}: empty body (status ${res.status})`);
        continue;
      }
      const sc = parseScorecard(res.body);
      await db
        .insert(rawScorecards)
        .values({
          ustaMatchId: m.matchId,
          year: m.year,
          sourceUrl: url,
          playedOn:
            parseUsDate(sc.header.datePlayed) ?? m.playedOn ?? null,
          rawHtml: res.body,
          parsed: sc as unknown as Record<string, unknown>,
          homeTeamName: sc.header.homeTeamName ?? m.homeTeam ?? null,
          visitorTeamName: sc.header.visitorTeamName ?? m.visitorTeam ?? null,
          league: sc.header.league ?? null,
          courtCount: sc.courts.length,
        })
        .onConflictDoNothing();
      await db
        .update(flightMatches)
        .set({ scorecardFetched: true })
        .where(eq(flightMatches.ustaMatchId, m.matchId));
      fetched += 1;
      if (fetched % 10 === 0) console.error(`  fetched ${fetched}…`);
    } catch (err) {
      errors += 1;
      console.error(
        `  ${m.matchId}: ERROR ${err instanceof Error ? err.message : err}`
      );
    }
  }
  console.error(
    `Done. fetched ${fetched}, already-present ${already} (marked), errors ${errors}.`
  );
  await (
    db as unknown as { $client: { end: () => Promise<void> } }
  ).$client.end();
}

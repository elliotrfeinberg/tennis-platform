// Phase-1 ingestion: load the public NTRP rating-search dumps
// (captures/norcal/ratings/{year}.json) into Postgres.
//
//   players              <- one row per unique person (deduped by
//                            displayName+gender within the section)
//   player_year_ratings  <- one row per (player, year): NTRP band, rating
//                            type, rating date, and the par1 token that is
//                            the entry point for phase-2 match crawling
//
// Identity caveat: USTA member ids aren't in the rating dump, so we dedupe
// players by normalized (displayName, gender). Distinct people who share a
// name+gender collapse into one player (and one of their same-year rating
// rows is dropped by the (player,year) unique). Resolving true identity via
// member ids from player-detail pages is future work.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createClient,
  sections,
  districts,
  players,
  playerYearRatings,
} from "@tennis/db";
import { eq } from "drizzle-orm";

const SECTION_CODE = "USTA/NO. CALIFORNIA";
const DISTRICT_NAME = "NO. CALIFORNIA";

interface RatingRow {
  name: string;
  gender?: string;
  city?: string;
  state?: string;
  ntrpLevel?: number;
  ratingDate?: string;
  ratingType?: string;
  playerPar1?: string;
}

type Gender = "M" | "F" | "X";

// "Last, First" -> "First Last". Leaves comma-less names as-is.
function firstLast(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  if (!m) return name.replace(/\s+/g, " ").trim();
  return `${m[2]!.trim()} ${m[1]!.trim()}`.replace(/\s+/g, " ").trim();
}
function mapGender(g?: string): Gender {
  return g === "M" ? "M" : g === "F" ? "F" : "X";
}
function parseDate(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}
function ntrpOf(r: RatingRow): number | null {
  return r.ntrpLevel && r.ntrpLevel > 0 ? r.ntrpLevel : null;
}
function pkey(displayName: string, gender: Gender): string {
  return `${displayName.toLowerCase()}|${gender}`;
}

async function inChunks<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<void>
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}

export async function loadPlayers(opts: {
  databaseUrl: string;
  ratingsDir: string;
  years: number[];
}): Promise<void> {
  const db = createClient(opts.databaseUrl);

  // Geographic anchors.
  await db
    .insert(sections)
    .values({ code: SECTION_CODE, displayName: SECTION_CODE })
    .onConflictDoNothing();
  await db
    .insert(districts)
    .values({ sectionCode: SECTION_CODE, name: DISTRICT_NAME })
    .onConflictDoNothing();
  const [district] = await db
    .select({ id: districts.id })
    .from(districts)
    .where(eq(districts.name, DISTRICT_NAME));
  const districtId = district!.id;

  // Load all year dumps up front.
  const sortedYears = [...opts.years].sort((a, b) => a - b);
  const dumps = new Map<number, RatingRow[]>();
  for (const y of sortedYears) {
    const parsed = JSON.parse(
      await readFile(join(opts.ratingsDir, `${y}.json`), "utf8")
    ) as { rows: RatingRow[] };
    dumps.set(y, parsed.rows);
    console.error(`  ${y}: ${parsed.rows.length} rating rows`);
  }

  // Unique players across years; later year wins for publishedNtrp.
  const uniq = new Map<
    string,
    { displayName: string; gender: Gender; ntrp: number | null; year: number }
  >();
  for (const y of sortedYears) {
    for (const r of dumps.get(y)!) {
      const displayName = firstLast(r.name);
      const gender = mapGender(r.gender);
      uniq.set(pkey(displayName, gender), {
        displayName,
        gender,
        ntrp: ntrpOf(r),
        year: y,
      });
    }
  }

  // Existing players in this section → id map.
  const existing = await db
    .select({
      id: players.id,
      displayName: players.displayName,
      gender: players.gender,
    })
    .from(players)
    .where(eq(players.sectionCode, SECTION_CODE));
  const idByKey = new Map<string, string>();
  for (const p of existing) {
    idByKey.set(pkey(p.displayName, (p.gender ?? "X") as Gender), p.id);
  }

  // Insert the players we haven't seen before.
  const toInsert = [...uniq.values()].filter(
    (v) => !idByKey.has(pkey(v.displayName, v.gender))
  );
  console.error(
    `  players: ${idByKey.size} existing, inserting ${toInsert.length} new`
  );
  await inChunks(toInsert, 500, async (chunk) => {
    const inserted = await db
      .insert(players)
      .values(
        chunk.map((v) => ({
          displayName: v.displayName,
          gender: v.gender,
          sectionCode: SECTION_CODE,
          districtId,
          publishedNtrp: v.ntrp,
          publishedNtrpYear: v.year,
        }))
      )
      .returning({
        id: players.id,
        displayName: players.displayName,
        gender: players.gender,
      });
    for (const row of inserted) {
      idByKey.set(pkey(row.displayName, (row.gender ?? "X") as Gender), row.id);
    }
  });

  // Per-year rating snapshots.
  for (const y of sortedYears) {
    const rows = dumps.get(y)!;
    let unresolved = 0;
    const values = [];
    for (const r of rows) {
      const pid = idByKey.get(pkey(firstLast(r.name), mapGender(r.gender)));
      if (!pid) {
        unresolved += 1;
        continue;
      }
      values.push({
        playerId: pid,
        year: y,
        ntrp: ntrpOf(r),
        ratingType: r.ratingType ? r.ratingType.slice(0, 8) : null,
        ratingDate: parseDate(r.ratingDate),
        tennislinkPar1: r.playerPar1 ?? null,
        gender: mapGender(r.gender),
        city: r.city ?? null,
        // A few dump rows carry a full state name ("California") instead of
        // the 2-letter code; keep the column happy.
        state: r.state ? r.state.slice(0, 8) : null,
      });
    }
    await inChunks(values, 500, async (chunk) => {
      await db
        .insert(playerYearRatings)
        .values(chunk)
        .onConflictDoNothing({
          target: [playerYearRatings.playerId, playerYearRatings.year],
        });
    });
    console.error(
      `  ${y}: ${values.length} rating rows prepared` +
        (unresolved ? ` (${unresolved} unresolved)` : "")
    );
  }

  // Close the pooled postgres connection so the process can exit (the
  // open socket otherwise keeps the event loop alive indefinitely).
  await (
    db as unknown as { $client: { end: () => Promise<void> } }
  ).$client.end();
}

// Server-side player data, backed by Postgres.
//
// players + player_year_ratings give the published-NTRP bands per season;
// player_perf_ratings + perf_match_results give the computed perf ratings and
// per-court history (joined to court_matches/teams for opponents + scores).

import "server-only";
import {
  createClient,
  players,
  playerYearRatings,
  playerPerfRatings,
  perfMatchResults,
  courtMatches,
  teamMatches,
  teams,
} from "@tennis/db";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";

const SECTION = "USTA/NO. CALIFORNIA";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _db: ReturnType<typeof createClient> | undefined;
function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = createClient(url);
  }
  return _db;
}

export interface PlayerYearBand {
  year: number;
  ntrp: number | null;
  ratingType: string | null;
  ratingDate: Date | null;
}

export interface PlayerRow {
  id: string;
  name: string;
  gender: string | null;
  memberId: string | null;
  latestNtrp: number | null;
  perf: number | null; // computed display perf rating, null if unrated
  bands: PlayerYearBand[]; // ascending by year
}

export interface PlayerListResult {
  rows: PlayerRow[];
  total: number;
  shown: number;
  bandCounts: { band: number; count: number }[];
}

export async function listPlayers(opts: {
  q?: string;
  band?: string;
  sort?: "name" | "band" | "perf";
  limit?: number;
}): Promise<PlayerListResult> {
  const d = db();
  const limit = opts.limit ?? 200;
  const q = (opts.q ?? "").trim();

  const conds = [eq(players.sectionCode, SECTION)];
  if (q) conds.push(ilike(players.displayName, `%${q}%`));
  if (opts.band) conds.push(eq(players.publishedNtrp, Number(opts.band)));
  const where = and(...conds);

  const totalRes = await d
    .select({ total: sql<number>`count(*)::int` })
    .from(players)
    .where(where);
  const total = totalRes[0]?.total ?? 0;

  const order =
    opts.sort === "perf"
      ? [sql`${playerPerfRatings.display} desc nulls last`, asc(players.displayName)]
      : opts.sort === "band"
        ? [sql`${players.publishedNtrp} desc nulls last`, asc(players.displayName)]
        : [asc(players.displayName)];
  const ps = await d
    .select({
      id: players.id,
      name: players.displayName,
      gender: players.gender,
      memberId: players.ustaMemberId,
      latestNtrp: players.publishedNtrp,
      perf: playerPerfRatings.display,
    })
    .from(players)
    .leftJoin(playerPerfRatings, eq(playerPerfRatings.playerId, players.id))
    .where(where)
    .orderBy(...order)
    .limit(limit);

  const ids = ps.map((p) => p.id);
  const yearRows = ids.length
    ? await d
        .select({
          playerId: playerYearRatings.playerId,
          year: playerYearRatings.year,
          ntrp: playerYearRatings.ntrp,
          ratingType: playerYearRatings.ratingType,
          ratingDate: playerYearRatings.ratingDate,
        })
        .from(playerYearRatings)
        .where(inArray(playerYearRatings.playerId, ids))
    : [];
  const bandsByPlayer = new Map<string, PlayerYearBand[]>();
  for (const r of yearRows) {
    const arr = bandsByPlayer.get(r.playerId) ?? [];
    arr.push({
      year: r.year,
      ntrp: r.ntrp,
      ratingType: r.ratingType,
      ratingDate: r.ratingDate,
    });
    bandsByPlayer.set(r.playerId, arr);
  }
  const rows: PlayerRow[] = ps.map((p) => ({
    ...p,
    bands: (bandsByPlayer.get(p.id) ?? []).sort((a, b) => a.year - b.year),
  }));

  const bc = await d
    .select({
      band: players.publishedNtrp,
      count: sql<number>`count(*)::int`,
    })
    .from(players)
    .where(eq(players.sectionCode, SECTION))
    .groupBy(players.publishedNtrp);
  const bandCounts = bc
    .filter((b) => b.band !== null)
    .map((b) => ({ band: b.band as number, count: b.count }))
    .sort((a, b) => a.band - b.band);

  return { rows, total, shown: rows.length, bandCounts };
}

export interface PlayerPerf {
  display: number | null;
  adult: number | null;
  mixed: number | null;
  adultMatches: number;
  mixedMatches: number;
  otherMatches: number;
}

export interface MatchLogEntry {
  playedOn: Date | null;
  category: string;
  kind: "S" | "D";
  line: number;
  perf: number;
  postRating: number | null;
  opponentRating: number | null;
  won: boolean;
  affectsRating: boolean;
  sets: Array<{ player: number; opponent: number }>;
  // Each opponent on the court, with their snapshotted (pre-match) perf
  // rating at the time this match was played. rating is null if the opponent
  // had no rating computed for this court.
  opponents: Array<{ name: string; rating: number | null }>;
  // Doubles partner(s) on the player's own side, with the same snapshotted
  // pre-match rating. Empty for singles.
  partners: Array<{ name: string; rating: number | null }>;
  opponentTeam: string | null;
}

export interface PlayerDetail extends PlayerRow {
  perfFull: PlayerPerf | null;
  matchLog: MatchLogEntry[];
}

export async function findPlayer(id: string): Promise<PlayerDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const d = db();
  const [p] = await d
    .select({
      id: players.id,
      name: players.displayName,
      gender: players.gender,
      memberId: players.ustaMemberId,
      latestNtrp: players.publishedNtrp,
    })
    .from(players)
    .where(eq(players.id, id))
    .limit(1);
  if (!p) return null;

  const yearRows = await d
    .select({
      year: playerYearRatings.year,
      ntrp: playerYearRatings.ntrp,
      ratingType: playerYearRatings.ratingType,
      ratingDate: playerYearRatings.ratingDate,
    })
    .from(playerYearRatings)
    .where(eq(playerYearRatings.playerId, id))
    .orderBy(asc(playerYearRatings.year));

  const [pr] = await d
    .select({
      display: playerPerfRatings.display,
      adult: playerPerfRatings.adult,
      mixed: playerPerfRatings.mixed,
      adultMatches: playerPerfRatings.adultMatches,
      mixedMatches: playerPerfRatings.mixedMatches,
      otherMatches: playerPerfRatings.otherMatches,
    })
    .from(playerPerfRatings)
    .where(eq(playerPerfRatings.playerId, id))
    .limit(1);

  // Per-court history with opponents + score (resolve side from the court's
  // player ids; orient sets to the player's perspective).
  const mr = await d
    .select({
      playedOn: perfMatchResults.playedOn,
      category: perfMatchResults.category,
      perf: perfMatchResults.perf,
      postRating: perfMatchResults.postRating,
      opponentRating: perfMatchResults.opponentRating,
      won: perfMatchResults.won,
      affectsRating: perfMatchResults.affectsRating,
      courtId: perfMatchResults.courtMatchId,
      kind: courtMatches.courtKind,
      line: courtMatches.line,
      sets: courtMatches.sets,
      h1: courtMatches.homePlayer1Id,
      h2: courtMatches.homePlayer2Id,
      v1: courtMatches.visitorPlayer1Id,
      v2: courtMatches.visitorPlayer2Id,
      homeTeamId: teamMatches.homeTeamId,
      visitorTeamId: teamMatches.visitorTeamId,
    })
    .from(perfMatchResults)
    .innerJoin(courtMatches, eq(perfMatchResults.courtMatchId, courtMatches.id))
    .innerJoin(teamMatches, eq(courtMatches.teamMatchId, teamMatches.id))
    .where(eq(perfMatchResults.playerId, id))
    .orderBy(asc(perfMatchResults.playedOn));

  // Collect every OTHER player on the player's courts — opponents AND doubles
  // partners — for one name lookup + one snapshot lookup.
  const otherPlayerIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const r of mr) {
    const isHome = id === r.h1 || id === r.h2;
    for (const o of isHome ? [r.v1, r.v2] : [r.h1, r.h2]) if (o) otherPlayerIds.add(o);
    for (const p of isHome ? [r.h1, r.h2] : [r.v1, r.v2])
      if (p && p !== id) otherPlayerIds.add(p);
    const ot = isHome ? r.visitorTeamId : r.homeTeamId;
    if (ot) teamIds.add(ot);
  }
  const nameById = new Map<string, string>();
  if (otherPlayerIds.size) {
    for (const row of await d
      .select({ id: players.id, name: players.displayName })
      .from(players)
      .where(inArray(players.id, [...otherPlayerIds]))) {
      nameById.set(row.id, row.name);
    }
  }
  const teamNameById = new Map<string, string>();
  if (teamIds.size) {
    for (const row of await d
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, [...teamIds]))) {
      teamNameById.set(row.id, row.name);
    }
  }

  // Each opponent's SNAPSHOTTED (pre-match) rating: every player on a court
  // has their own perf_match_results row carrying preRating for that court,
  // so we look opponents up by (courtMatchId, playerId) — no extra storage.
  const courtIds = mr.map((r) => r.courtId);
  const snapByCourtPlayer = new Map<string, number | null>();
  if (courtIds.length && otherPlayerIds.size) {
    for (const row of await d
      .select({
        courtId: perfMatchResults.courtMatchId,
        playerId: perfMatchResults.playerId,
        preRating: perfMatchResults.preRating,
      })
      .from(perfMatchResults)
      .where(
        and(
          inArray(perfMatchResults.courtMatchId, courtIds),
          inArray(perfMatchResults.playerId, [...otherPlayerIds])
        )
      )) {
      snapByCourtPlayer.set(`${row.courtId}:${row.playerId}`, row.preRating);
    }
  }

  const matchLog: MatchLogEntry[] = mr.map((r) => {
    const isHome = id === r.h1 || id === r.h2;
    const oppIds = (isHome ? [r.v1, r.v2] : [r.h1, r.h2]).filter(
      (x): x is string => !!x
    );
    const partnerIds = (isHome ? [r.h1, r.h2] : [r.v1, r.v2]).filter(
      (x): x is string => !!x && x !== id
    );
    const oppTeamId = isHome ? r.visitorTeamId : r.homeTeamId;
    const rawSets =
      (r.sets as Array<{ home: number; visitor: number }> | null) ?? [];
    const sets = rawSets.map((s) =>
      isHome
        ? { player: s.home, opponent: s.visitor }
        : { player: s.visitor, opponent: s.home }
    );
    return {
      playedOn: r.playedOn,
      category: r.category,
      kind: r.kind,
      line: r.line,
      perf: r.perf,
      postRating: r.postRating,
      opponentRating: r.opponentRating,
      won: r.won,
      affectsRating: r.affectsRating,
      sets,
      opponents: oppIds.map((o) => ({
        name: nameById.get(o) ?? "(unknown)",
        rating: snapByCourtPlayer.get(`${r.courtId}:${o}`) ?? null,
      })),
      partners: partnerIds.map((p) => ({
        name: nameById.get(p) ?? "(unknown)",
        rating: snapByCourtPlayer.get(`${r.courtId}:${p}`) ?? null,
      })),
      opponentTeam: oppTeamId ? teamNameById.get(oppTeamId) ?? null : null,
    };
  });

  return {
    ...p,
    perf: pr?.display ?? null,
    bands: yearRows,
    perfFull: pr ?? null,
    matchLog,
  };
}

const RATING_TYPE_LABEL: Record<string, string> = {
  C: "Computer",
  S: "Self-rated",
  A: "Appeal",
  M: "Mixed",
  T: "Tournament",
  D: "Dynamic",
};
export function ratingTypeLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return RATING_TYPE_LABEL[t] ?? t;
}

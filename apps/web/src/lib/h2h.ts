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

export interface H2HPlayer {
  id: string;
  name: string;
  init: string;
  gender: string | null;
  perf: number | null;
  band: number | null;
  adult: number | null;
  mixed: number | null;
  w: number;
  l: number;
  winPct: number;
  // opponentId → { name, w, l }
  faced: Record<string, { name: string; w: number; l: number }>;
}

interface CourtRow {
  h1: string | null; h2: string | null; v1: string | null; v2: string | null;
  h1n: string | null; h2n: string | null; v1n: string | null; v2n: string | null;
  homeWon: boolean;
}

async function courtsFor(id: string): Promise<CourtRow[]> {
  return (await db().execute(sql`
    SELECT cm.home_player1_id h1, cm.home_player2_id h2, cm.visitor_player1_id v1, cm.visitor_player2_id v2,
           p1.display_name h1n, p2.display_name h2n, q1.display_name v1n, q2.display_name v2n,
           cm.home_won AS "homeWon"
    FROM court_matches cm
    LEFT JOIN players p1 ON p1.id = cm.home_player1_id
    LEFT JOIN players p2 ON p2.id = cm.home_player2_id
    LEFT JOIN players q1 ON q1.id = cm.visitor_player1_id
    LEFT JOIN players q2 ON q2.id = cm.visitor_player2_id
    WHERE cm.home_player1_id = ${id} OR cm.home_player2_id = ${id}
       OR cm.visitor_player1_id = ${id} OR cm.visitor_player2_id = ${id}
  `)) as unknown as CourtRow[];
}

export async function h2hPlayer(id: string): Promise<H2HPlayer | null> {
  const base = (await db().execute(sql`
    SELECT p.id, p.display_name name, p.gender, p.published_ntrp band,
           ppr.display perf, ppr.adult, ppr.mixed
    FROM players p LEFT JOIN player_perf_ratings ppr ON ppr.player_id = p.id
    WHERE p.id = ${id} LIMIT 1
  `)) as unknown as Array<{ id: string; name: string; gender: string | null; band: number | null; perf: number | null; adult: number | null; mixed: number | null }>;
  const b = base[0];
  if (!b) return null;

  const courts = await courtsFor(id);
  let w = 0, l = 0;
  const faced: Record<string, { name: string; w: number; l: number }> = {};
  for (const c of courts) {
    const isHome = c.h1 === id || c.h2 === id;
    const won = isHome ? c.homeWon : !c.homeWon;
    if (won) w += 1; else l += 1;
    const opps: Array<[string | null, string | null]> = isHome
      ? [[c.v1, c.v1n], [c.v2, c.v2n]]
      : [[c.h1, c.h1n], [c.h2, c.h2n]];
    for (const [oid, oname] of opps) {
      if (!oid || !oname) continue;
      const e = (faced[oid] ??= { name: oname, w: 0, l: 0 });
      if (won) e.w += 1; else e.l += 1;
    }
  }
  const total = w + l;
  return {
    id: b.id, name: b.name, init: b.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase(),
    gender: b.gender, perf: b.perf, band: b.band, adult: b.adult, mixed: b.mixed,
    w, l, winPct: total ? Math.round((w / total) * 100) : 0, faced,
  };
}

export interface H2HMeeting { aWon: boolean; court: string; score: string }

export async function meetings(idA: string, idB: string): Promise<H2HMeeting[]> {
  const rows = (await db().execute(sql`
    SELECT cm.court_kind kind, cm.line, cm.sets, cm.home_won AS "homeWon",
      (cm.home_player1_id = ${idA} OR cm.home_player2_id = ${idA}) AS "aHome"
    FROM court_matches cm
    WHERE ((cm.home_player1_id = ${idA} OR cm.home_player2_id = ${idA}) AND (cm.visitor_player1_id = ${idB} OR cm.visitor_player2_id = ${idB}))
       OR ((cm.visitor_player1_id = ${idA} OR cm.visitor_player2_id = ${idA}) AND (cm.home_player1_id = ${idB} OR cm.home_player2_id = ${idB}))
  `)) as unknown as Array<{ kind: "S" | "D"; line: number; sets: unknown; homeWon: boolean; aHome: boolean }>;
  return rows.map((r) => {
    const sets = ((r.sets as Array<{ home: number; visitor: number }>) ?? []);
    const aWon = r.aHome ? r.homeWon : !r.homeWon;
    // Score from A's perspective.
    const score = sets.map((s) => (r.aHome ? `${s.home}–${s.visitor}` : `${s.visitor}–${s.home}`)).join(", ");
    return { aWon, court: `${r.kind}${r.line}`, score: score || "—" };
  });
}

export interface H2HData {
  a: H2HPlayer;
  b: H2HPlayer;
  meetings: H2HMeeting[];
  common: Array<{ name: string; aRec: string; bRec: string; aN: number; bN: number }>;
}

export async function headToHead(idA: string, idB: string): Promise<H2HData | null> {
  const [a, b, ms] = await Promise.all([h2hPlayer(idA), h2hPlayer(idB), meetings(idA, idB)]);
  if (!a || !b) return null;
  const common = Object.keys(a.faced)
    .filter((oid) => b.faced[oid] && oid !== idA && oid !== idB)
    .map((oid) => {
      const af = a.faced[oid]!, bf = b.faced[oid]!;
      return { name: af.name, aRec: `${af.w}–${af.l}`, bRec: `${bf.w}–${bf.l}`, aN: af.w, bN: bf.w };
    })
    .sort((x, y) => y.aN + y.bN - (x.aN + x.bN))
    .slice(0, 8);
  return { a, b, meetings: ms, common };
}

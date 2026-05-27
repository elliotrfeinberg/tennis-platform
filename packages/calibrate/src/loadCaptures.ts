// Load a parsed subflight crawl (the aggregate + per-team parsed.json
// blobs) into an in-memory shape suitable for chronological Glicko
// updates and NTRP fitting.
//
// What we extract:
//
// - One PlayerLabel per unique player (deduped by USTA member id where
//   available, otherwise by normalized name). The roster entry gives
//   us their labeled NTRP level.
// - One CourtMatch per played court across every scorecard in every
//   team's crawl. We resolve player *names* in scorecards back to the
//   master player key via the team roster + ViewState id map. Each
//   match appears on two team profiles (home + visitor crawled it
//   independently); we dedupe by matchId+line+kind.
//
// Path conventions:
//
//   captures/parsed/{teamId}-subflight/{ts}.json   <- aggregate (input)
//   captures/raw/{teamId}-subflight/{ts}/par1s.json
//   captures/raw/{teamId}-subflight/{ts}/teams/{teamId}/parsed.json
//
// The raw dir is derived from the aggregate's filename — we don't
// trust the aggregate's `rawDir` field (it's a relative path written
// at crawl time and won't resolve if the caller is in a different cwd).

import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  ParsedScorecard,
  ParsedTeamProfile,
} from "@tennis/scraper";

export interface PlayerLabel {
  // USTA member id when known, otherwise "name:<normalized name>".
  // Same value used as homePlayerKeys / visitorPlayerKeys on matches.
  key: string;
  name: string;
  memberId: string | undefined;
  // Labeled NTRP level from at least one team roster (e.g. 3.5).
  // Undefined if every roster entry for this player was blank.
  ntrp: number | undefined;
  // Subflight team names this player appears on (usually length 1).
  teams: string[];
}

export interface CourtMatch {
  matchId: string;
  // Parsed datePlayed (e.g. "4/28/2026" -> Date). Falls back to
  // dateScheduled if datePlayed is missing.
  date: Date;
  homeTeamName: string;
  visitorTeamName: string;
  line: number;
  kind: "S" | "D";
  homePlayerKeys: string[];
  visitorPlayerKeys: string[];
  // True = home won, false = visitor won. Undefined = no mark.gif on
  // either side (rare; usually means a court we shouldn't rate).
  homeWon: boolean | undefined;
  // Side that retired mid-match, if any. The other side won.
  retired: "home" | "visitor" | undefined;
  // Side that defaulted (didn't play). The other side won by walkover.
  defaulted: "home" | "visitor" | undefined;
}

export interface CapturesData {
  year: number;
  ownTeamName: string;
  ownTeamId: string | undefined;
  players: Map<string, PlayerLabel>;
  matches: CourtMatch[];
  // Distinct scorecard names that didn't match any roster entry; these
  // got synthesized "name:..." keys (no NTRP label, no team).
  unresolvedNames: string[];
}

interface SubflightAggregate {
  fetchedAt: string;
  year: number;
  ownTeamName: string;
  ownPar1: string;
  ownTeamId: string | undefined;
  rawDir: string;
  teams: Array<{
    teamName: string;
    par1: string;
    teamId?: string;
    ok: boolean;
  }>;
}

interface CrawlTeamFileShape {
  teamRef: { par1: string; year: number };
  fetchedAt: string;
  teamId: string | undefined;
  teamProfile: ParsedTeamProfile;
  ids: {
    playersByName: Record<string, string>;
    teamsByName: Record<string, string>;
    matchIds: string[];
  };
  scorecards: Array<{
    matchId: string;
    url: string;
    parsed: ParsedScorecard;
  }>;
}

export async function loadCaptures(
  aggregatePath: string
): Promise<CapturesData> {
  const agg = JSON.parse(
    await readFile(aggregatePath, "utf8")
  ) as SubflightAggregate;
  const rawDir = deriveRawDir(aggregatePath);

  const players = new Map<string, PlayerLabel>();
  const matches = new Map<string, CourtMatch>(); // key = matchId#line#kind
  const unresolved = new Set<string>();

  // Two passes are necessary so that a scorecard mentioning an
  // opponent's player resolves against the opponent's roster — even if
  // the opponent's team file is read after the scorecard's home team.
  // Pre-load all team crawls (cheap; the files already live on disk).
  const teamCrawls: Array<{ team: SubflightAggregate["teams"][number]; crawl: CrawlTeamFileShape }> = [];
  for (const team of agg.teams) {
    if (!team.ok || !team.teamId) continue;
    const parsedPath = join(rawDir, "teams", team.teamId, "parsed.json");
    let crawl: CrawlTeamFileShape;
    try {
      crawl = JSON.parse(
        await readFile(parsedPath, "utf8")
      ) as CrawlTeamFileShape;
    } catch (err) {
      throw new Error(
        `Failed to read ${parsedPath}: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
    teamCrawls.push({ team, crawl });
  }

  // Pass 1: register every team's roster as a labeled player. After
  // this pass, `players` contains every rostered player across the
  // subflight, with NTRP labels and team affiliations.
  for (const { team, crawl } of teamCrawls) {
    const nameToMemberId = new Map<string, string>(
      Object.entries(crawl.ids.playersByName)
    );
    for (const entry of crawl.teamProfile.roster) {
      const memberId = nameToMemberId.get(entry.name);
      const key = playerKey(entry.name, memberId);
      const existing = players.get(key);
      if (existing) {
        if (!existing.teams.includes(team.teamName)) {
          existing.teams.push(team.teamName);
        }
        if (existing.ntrp === undefined && entry.ntrp !== undefined) {
          existing.ntrp = entry.ntrp;
        }
      } else {
        players.set(key, {
          key,
          name: entry.name,
          memberId,
          ntrp: entry.ntrp,
          teams: [team.teamName],
        });
      }
    }
  }

  // Pass 2: walk scorecards. Dedup by matchId+line+kind so we don't
  // double-count when both teams of a match are crawled.
  for (const { crawl } of teamCrawls) {
    for (const sc of crawl.scorecards) {
      const header = sc.parsed.header;
      const datePlayed = parseDate(header.datePlayed ?? header.dateScheduled);
      if (!datePlayed) continue;
      for (const court of sc.parsed.courts) {
        const key = `${sc.matchId}#${court.line}#${court.kind}`;
        if (matches.has(key)) continue;

        const homePlayerKeys: string[] = [];
        const visitorPlayerKeys: string[] = [];
        for (const n of court.homePlayers) {
          homePlayerKeys.push(resolveName(n, players, unresolved));
        }
        for (const n of court.visitorPlayers) {
          visitorPlayerKeys.push(resolveName(n, players, unresolved));
        }
        matches.set(key, {
          matchId: sc.matchId,
          date: datePlayed,
          homeTeamName: header.homeTeamName,
          visitorTeamName: header.visitorTeamName,
          line: court.line,
          kind: court.kind,
          homePlayerKeys,
          visitorPlayerKeys,
          homeWon: court.homeWon,
          retired: court.retired,
          defaulted: court.defaulted,
        });
      }
    }
  }

  const matchList = [...matches.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  return {
    year: agg.year,
    ownTeamName: agg.ownTeamName,
    ownTeamId: agg.ownTeamId,
    players,
    matches: matchList,
    unresolvedNames: [...unresolved],
  };
}

// Derive the raw-data directory from the aggregate's path. The
// aggregate's own `rawDir` field is a relative path written at crawl
// time and may not resolve if the caller is in a different cwd.
//   .../parsed/{key}/{ts}.json  →  .../raw/{key}/{ts}/
function deriveRawDir(aggregatePath: string): string {
  const ts = basename(aggregatePath, ".json");
  const subflightDir = dirname(aggregatePath); // .../parsed/{key}
  const subflightKey = basename(subflightDir);
  const captures = dirname(dirname(subflightDir)); // .../captures
  return join(captures, "raw", subflightKey, ts);
}

function playerKey(name: string, memberId: string | undefined): string {
  if (memberId) return memberId;
  return `name:${normalizeName(name)}`;
}

function normalizeName(s: string): string {
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

// Given a name from a scorecard, find the matching player key. We walk
// the existing players map (already populated from rosters); if no
// match, synthesize a "name:..." key and remember the unresolved name.
function resolveName(
  name: string,
  players: Map<string, PlayerLabel>,
  unresolved: Set<string>
): string {
  const norm = normalizeName(name);
  for (const p of players.values()) {
    if (normalizeName(p.name) === norm) return p.key;
  }
  const key = `name:${norm}`;
  if (!players.has(key)) {
    players.set(key, {
      key,
      name,
      memberId: undefined,
      ntrp: undefined,
      teams: [],
    });
  }
  unresolved.add(name);
  return key;
}

function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

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
  ParsedRatingSearch,
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
  // Per-season roster band, keyed by season year. A player who plays in
  // both 2025 and 2026 has an entry for each — the perf model uses this
  // to clamp a carried-over rating into the correct year's band. `ntrp`
  // above is the first-seen value; this map preserves the full history.
  ntrpByYear: Map<number, number>;
  // USTA rating type from a year-end dump when available: "C" computer,
  // "S" self-rated, "A" appealed, etc. Undefined when no dump was loaded
  // or the player wasn't in it. The perf model trusts self-rates ("S")
  // less as an anchor for other players' ratings. Roster crawls don't
  // expose this — it only comes from the rating-search dump.
  ratingType: string | undefined;
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
  // Sum of games won across all sets in the match, per side. Undefined
  // when the scorecard didn't record set scores (e.g. defaulted before
  // play). Glicko-2 ignores these; the perf model prefers `sets`.
  gamesHome: number | undefined;
  gamesVisitor: number | undefined;
  // Per-set scores as captured by parseScorecard. Empty array when no
  // sets were played (default before any games). The perf model uses
  // this for table-based score → rating-diff lookup.
  sets: Array<{ home: number; visitor: number }>;
  // Raw league string from the scorecard header (e.g. "2026 ADULT 18&Over
  // - Women's 3.5"). Used by classifyLeague to route matches to adult /
  // mixed / combo / other rating streams.
  league: string | undefined;
  // Season year this match belongs to (from the source aggregate, NOT
  // the calendar year of `date` — USTA seasons can spill across the new
  // year). Drives the perf model's year-boundary carry-over.
  seasonYear: number;
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
  // When year-end labels are provided, this is the count of rostered
  // players whose name matched a row in the dump (regardless of whether
  // the value differed from the roster level).
  yearEndLabelMatches: number;
  // Subset of yearEndLabelMatches where the year-end NTRP value differed
  // from the roster-derived value (i.e. a real label change). When this
  // is zero, the dump is confirming-only — no multi-band signal.
  yearEndLabelOverrides: number;
  // Names from the year-end search dump that we couldn't match to any
  // rostered player. Often these are players in the same NTRP scope but
  // on teams outside the subflight crawl.
  yearEndUnmatched: number;
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

export interface LoadCapturesOptions {
  // Path to a JSON dump of a parseRatingSearch result (i.e. the output
  // of `tennis-scrape parse rating-search ...`). When provided, each
  // rostered player whose name matches a row in the dump has their
  // NTRP label overridden with the year-end-rating value. This is
  // strictly more authoritative than the roster level: rosters reflect
  // the level a player *registered at*; year-end ratings reflect what
  // USTA's algorithm finally placed them at.
  yearEndLabelsPath?: string;
  // Directory of per-season rating dumps named `{year}.json` (the output
  // of `tennis-scrape crawl norcal`). When set, each aggregate resolves
  // its labels from `{ratingsDir}/{agg.year}.json` — so a multi-year load
  // picks the right season's bands + rating types per aggregate. Ignored
  // for a given aggregate if that year's file is missing. `yearEndLabelsPath`
  // takes precedence when both are set.
  ratingsDir?: string;
  // Only use year-end rows of these rating types. Defaults to ["C"]
  // (computer-rated) since those are the most reliable. Set to undefined
  // to accept all types (S, A, D, etc. — useful for debugging but adds
  // noise from self-rates and appeals).
  yearEndRatingTypes?: string[] | undefined;
}

export async function loadCaptures(
  aggregatePath: string,
  opts: LoadCapturesOptions = {}
): Promise<CapturesData> {
  const agg = JSON.parse(
    await readFile(aggregatePath, "utf8")
  ) as SubflightAggregate;
  const rawDir = deriveRawDir(aggregatePath);

  // Year-end labels, if provided. Keyed by normalized "first last".
  const yearEndByName = new Map<
    string,
    { ntrp: number; type: string | undefined }
  >();
  // Which rating types are trusted enough to OVERRIDE the roster band.
  // Self-rates/appeals are still recorded (for the perf confidence model)
  // but don't replace the roster-derived NTRP label unless explicitly
  // allowed.
  const yearEndAllowed = opts.yearEndRatingTypes ?? ["C"];
  const yearEndAllowAll = opts.yearEndRatingTypes === undefined;
  // Resolve the labels file: an explicit path wins; otherwise fall back to
  // the per-year dump in ratingsDir for THIS aggregate's season.
  const labelsPath =
    opts.yearEndLabelsPath ??
    (opts.ratingsDir ? join(opts.ratingsDir, `${agg.year}.json`) : undefined);
  if (labelsPath) {
    const text = await readFile(labelsPath, "utf8").catch(() => undefined);
    const parsed = text
      ? (JSON.parse(text) as ParsedRatingSearch)
      : { context: undefined, rows: [] };
    for (const row of parsed.rows) {
      if (row.ntrpLevel === undefined) continue;
      if (row.ntrpLevel === 0) continue; // unrated placeholder
      const key = lastnameCommaFirstToNorm(row.name);
      if (!key) continue;
      // Record every type (S/C/A/...) so the confidence model can see
      // self-rates; the override loop below decides whether to also
      // adopt the value as the band label. Last write wins on collisions.
      yearEndByName.set(key, { ntrp: row.ntrpLevel, type: row.ratingType });
    }
  }

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

  let yearEndLabelOverrides = 0;
  let yearEndLabelMatches = 0;
  // Track which year-end rows we actually matched so we can report the
  // unmatched count at the end.
  const yearEndMatchedKeys = new Set<string>();

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
        if (entry.ntrp !== undefined && !existing.ntrpByYear.has(agg.year)) {
          existing.ntrpByYear.set(agg.year, entry.ntrp);
        }
      } else {
        const ntrpByYear = new Map<number, number>();
        if (entry.ntrp !== undefined) ntrpByYear.set(agg.year, entry.ntrp);
        players.set(key, {
          key,
          name: entry.name,
          memberId,
          ntrp: entry.ntrp,
          ntrpByYear,
          ratingType: undefined,
          teams: [team.teamName],
        });
      }
    }
  }

  // Year-end override pass: for any rostered player whose name matches
  // a year-end search row, replace the roster-derived NTRP label with
  // the year-end one. Match keys are "first last" normalized.
  if (yearEndByName.size > 0) {
    for (const p of players.values()) {
      const key = firstLastNorm(p.name);
      const hit = yearEndByName.get(key);
      if (!hit) continue;
      yearEndMatchedKeys.add(key);
      yearEndLabelMatches += 1;
      // Always record the rating type (drives the perf confidence model).
      p.ratingType = hit.type;
      // Only trusted types replace the band label / per-year band.
      if (yearEndAllowAll || yearEndAllowed.includes(hit.type ?? "")) {
        if (p.ntrp !== hit.ntrp) yearEndLabelOverrides += 1;
        p.ntrp = hit.ntrp;
        p.ntrpByYear.set(agg.year, hit.ntrp);
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
        // Sum games per side across the match's sets. Cap each set at
        // a reasonable game count so a 10-point match-tiebreak (parsed
        // as e.g. 10-7) doesn't dominate two normal 6-4 sets.
        let gh: number | undefined;
        let gv: number | undefined;
        if (court.sets && court.sets.length > 0) {
          gh = 0;
          gv = 0;
          for (const s of court.sets) {
            gh += s.home;
            gv += s.visitor;
          }
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
          gamesHome: gh,
          gamesVisitor: gv,
          sets: court.sets
            ? court.sets.map((s) => ({ home: s.home, visitor: s.visitor }))
            : [],
          league: header.league,
          seasonYear: agg.year,
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
    yearEndLabelMatches,
    yearEndLabelOverrides,
    yearEndUnmatched: yearEndByName.size - yearEndMatchedKeys.size,
  };
}

// Load multiple subflight aggregates and union them into a single
// CapturesData. This is the multi-flight path: capture a 3.0 women's
// subflight + 3.5 + 4.0 (same league/section), then fit one Glicko
// model across all three so the NTRP regression has real range.
//
// Merge semantics:
// - Players are deduped by playerKey (memberId when known, else
//   normalized name). When the same player appears in multiple
//   aggregates, we keep their first-seen ntrp/memberId, append any
//   new team names, and use the larger pool of metadata.
// - Matches dedup on the existing matchId#line#kind key (a match
//   that touches two crawled aggregates will appear in both but
//   only counts once).
// - The first aggregate's year/ownTeamName/ownTeamId become the
//   "primary" identity of the returned CapturesData. This is purely
//   for reporting — Glicko/fit don't read it.
// - The year-end-label counts are summed across aggregates so the
//   CLI summary reflects total coverage.
export async function loadCapturesMulti(
  aggregatePaths: string[],
  opts: LoadCapturesOptions = {}
): Promise<CapturesData> {
  if (aggregatePaths.length === 0) {
    throw new Error("loadCapturesMulti: at least one aggregate path required");
  }
  if (aggregatePaths.length === 1) {
    return loadCaptures(aggregatePaths[0]!, opts);
  }
  const loaded = await Promise.all(
    aggregatePaths.map((p) => loadCaptures(p, opts))
  );
  return mergeCaptures(loaded);
}

// Pure merge of multiple CapturesData into one. Exported for tests so
// we can validate union semantics without touching the filesystem.
export function mergeCaptures(parts: CapturesData[]): CapturesData {
  if (parts.length === 0) {
    throw new Error("mergeCaptures: at least one CapturesData required");
  }
  const first = parts[0]!;
  if (parts.length === 1) return first;

  // Defensive copy of first.players — we mutate teams[] and ntrp on
  // collisions, and we don't want to leak that into the caller's input.
  const players = new Map<string, PlayerLabel>();
  for (const [k, p] of first.players) {
    players.set(k, {
      ...p,
      teams: [...p.teams],
      ntrpByYear: new Map(p.ntrpByYear),
    });
  }
  const matchesByKey = new Map<string, CourtMatch>();
  for (const m of first.matches) {
    matchesByKey.set(`${m.matchId}#${m.line}#${m.kind}`, m);
  }
  const unresolved = new Set<string>(first.unresolvedNames);
  let yearEndLabelMatches = first.yearEndLabelMatches;
  let yearEndLabelOverrides = first.yearEndLabelOverrides;
  let yearEndUnmatched = first.yearEndUnmatched;

  for (let i = 1; i < parts.length; i++) {
    const next = parts[i]!;
    for (const [key, p] of next.players) {
      const existing = players.get(key);
      if (existing) {
        for (const t of p.teams) {
          if (!existing.teams.includes(t)) existing.teams.push(t);
        }
        if (existing.ntrp === undefined && p.ntrp !== undefined) {
          existing.ntrp = p.ntrp;
        }
        if (existing.memberId === undefined && p.memberId !== undefined) {
          existing.memberId = p.memberId;
        }
        if (existing.ratingType === undefined && p.ratingType !== undefined) {
          existing.ratingType = p.ratingType;
        }
        for (const [yr, lvl] of p.ntrpByYear) {
          if (!existing.ntrpByYear.has(yr)) existing.ntrpByYear.set(yr, lvl);
        }
      } else {
        players.set(key, {
          ...p,
          teams: [...p.teams],
          ntrpByYear: new Map(p.ntrpByYear),
        });
      }
    }
    for (const m of next.matches) {
      const k = `${m.matchId}#${m.line}#${m.kind}`;
      if (!matchesByKey.has(k)) matchesByKey.set(k, m);
    }
    for (const n of next.unresolvedNames) unresolved.add(n);
    yearEndLabelMatches += next.yearEndLabelMatches;
    yearEndLabelOverrides += next.yearEndLabelOverrides;
    // yearEndUnmatched is per-aggregate; summing would double-count
    // when the same dump is loaded for each aggregate. Take the min
    // (the dump rows that nobody in any aggregate matched).
    yearEndUnmatched = Math.min(yearEndUnmatched, next.yearEndUnmatched);
  }

  const matchList = [...matchesByKey.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  return {
    year: first.year,
    ownTeamName: first.ownTeamName,
    ownTeamId: first.ownTeamId,
    players,
    matches: matchList,
    unresolvedNames: [...unresolved],
    yearEndLabelMatches,
    yearEndLabelOverrides,
    yearEndUnmatched,
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
      ntrpByYear: new Map<number, number>(),
      ratingType: undefined,
      teams: [],
    });
  }
  unresolved.add(name);
  return key;
}

// Normalize a roster-style name ("Stella So") to lowercase
// "firstname lastname" with collapsed whitespace. Used as the
// year-end-label lookup key on the roster side.
function firstLastNorm(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

// Convert a year-end "Lastname, Firstname" entry to the same
// "firstname lastname" form used by firstLastNorm. Returns an empty
// string for entries without a comma (defensive — we've only ever
// seen the Lastname, Firstname form in practice).
function lastnameCommaFirstToNorm(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  if (!m) return name.replace(/\s+/g, " ").trim().toLowerCase();
  const last = m[1]!.trim();
  const first = m[2]!.trim();
  return `${first} ${last}`.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

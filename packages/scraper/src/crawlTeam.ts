// Single-team crawl orchestrator.
//
// Given a logged-in fetcher and a team par1+year, GET the team profile,
// parse it, extract the ViewState ids, then GET each completed-match
// scorecard linked from the schedule. Returns one self-contained,
// JSON-serializable result blob. The caller decides where to persist it.
//
// Failure policy: a fatal failure on the team profile aborts (no
// scorecards to walk). A failure on any individual scorecard is captured
// in `errors[]` and the crawl continues — partial results beat nothing.
//
// Politeness is the fetcher's responsibility; this module only places
// requests, never sleeps.

import { extractViewStateIds, type ViewStateIds } from "./viewStateIds.js";
import {
  parseScorecard,
  type ParsedScorecard,
} from "./parseScorecard.js";
import {
  parseTeamProfile,
  type ParsedTeamProfile,
} from "./parseTeamProfile.js";
import {
  scorecardUrl,
  teamProfileUrl,
  type TeamRef,
} from "./tennislinkUrls.js";

// Minimal fetcher shape — anything that can GET a URL and return a body.
// PoliteFetcher satisfies this; tests use a stub.
export interface CrawlFetcher {
  fetch(url: string): Promise<{ status: number; body: string | null }>;
}

export interface CrawledScorecard {
  matchId: string;
  url: string;
  parsed: ParsedScorecard;
}

export interface CrawlError {
  step: "team-profile" | "scorecard";
  matchId?: string;
  url: string;
  message: string;
}

export interface CrawlTeamOptions {
  // Called with raw HTML for each successful GET, so the caller can
  // persist HTML alongside the parsed JSON. Failures here are swallowed
  // (a write error shouldn't kill an in-flight crawl).
  onRawHtml?: (
    kind: "team-profile" | "scorecard",
    id: string,
    html: string
  ) => void | Promise<void>;
  // If true, also fetch scorecards for matches that don't have a played
  // result yet. Default false: pre-match scorecards are empty placeholders.
  includeUpcoming?: boolean;
}

export interface CrawlTeamResult {
  teamRef: TeamRef;
  fetchedAt: string;
  // Canonical USTA team id, if we found one for this team's name in the
  // ViewState. The par1 in teamRef is an *opaque* hex token; this is the
  // 10-digit numeric id that's stable across entry points.
  teamId: string | undefined;
  teamProfile: ParsedTeamProfile;
  ids: {
    playersByName: Record<string, string>;
    teamsByName: Record<string, string>;
    matchIds: string[];
  };
  scorecards: CrawledScorecard[];
  errors: CrawlError[];
}

export async function crawlTeam(
  fetcher: CrawlFetcher,
  team: TeamRef,
  opts: CrawlTeamOptions = {}
): Promise<CrawlTeamResult> {
  const fetchedAt = new Date().toISOString();
  const profileUrl = teamProfileUrl(team);

  const profileRes = await fetcher.fetch(profileUrl);
  if (!profileRes.body) {
    throw new Error(
      `Empty team-profile response (status ${profileRes.status}) for ${profileUrl}`
    );
  }
  await callRaw(opts, "team-profile", team.par1, profileRes.body);

  const teamProfile = parseTeamProfile(profileRes.body);
  const ids = extractViewStateIds(profileRes.body);
  const teamId = lookupTeamId(teamProfile.header.teamName, ids);

  const errors: CrawlError[] = [];
  const scorecards: CrawledScorecard[] = [];

  const matchesToFetch = teamProfile.schedule.filter((row) => {
    if (!row.matchId) return false;
    if (opts.includeUpcoming) return true;
    return row.played;
  });

  for (const row of matchesToFetch) {
    const matchId = row.matchId!;
    const url = scorecardUrl({ matchId, year: team.year });
    try {
      const res = await fetcher.fetch(url);
      if (!res.body) {
        errors.push({
          step: "scorecard",
          matchId,
          url,
          message: `Empty body (status ${res.status})`,
        });
        continue;
      }
      await callRaw(opts, "scorecard", matchId, res.body);
      scorecards.push({
        matchId,
        url,
        parsed: parseScorecard(res.body),
      });
    } catch (err) {
      errors.push({
        step: "scorecard",
        matchId,
        url,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    teamRef: team,
    fetchedAt,
    teamId,
    teamProfile,
    ids: {
      playersByName: Object.fromEntries(ids.playersByName),
      teamsByName: Object.fromEntries(ids.teamsByName),
      matchIds: ids.matchIds,
    },
    scorecards,
    errors,
  };
}

function lookupTeamId(
  teamName: string,
  ids: ViewStateIds
): string | undefined {
  const direct = ids.teamsByName.get(teamName);
  if (direct) return direct;
  // The profile header sometimes contains stray whitespace from the raw
  // HTML; the ViewState's stored name is the canonical form. Try a
  // case-insensitive match as a last resort.
  const wanted = teamName.toLowerCase();
  for (const [k, v] of ids.teamsByName) {
    if (k.toLowerCase() === wanted) return v;
  }
  return undefined;
}

async function callRaw(
  opts: CrawlTeamOptions,
  kind: "team-profile" | "scorecard",
  id: string,
  html: string
): Promise<void> {
  if (!opts.onRawHtml) return;
  try {
    await opts.onRawHtml(kind, id, html);
  } catch {
    // Persistence failures are non-fatal — surface via the caller's own
    // logging if they care; the crawl result is the source of truth.
  }
}

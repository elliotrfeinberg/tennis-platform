#!/usr/bin/env node
// Worker CLI. Subcommands:
//
//   capture <url> <out>                       fetch one URL, write raw HTML
//   capture-postback <url> <eventTarget> <out>  follow an ASP.NET __doPostBack
//   parse <kind> <html-file>                  parse a saved HTML file
//   robots <host>                             fetch and print robots.txt
//   session init                              write a USTA session template
//   session check                             verify USTA session cookies work
//   crawl team <par1> <year>                  full team crawl: profile + scorecards
//
// All network calls respect TENNIS_CONTACT_EMAIL.
//
// `capture` uses your USTA session (~/.tennis-platform/usta-session.json) by
// default; pass --no-auth to fetch as an anonymous client. Auth-walled URLs
// raise LoginRequiredError, signalling that cookies are missing/expired.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BrowserFetcher,
  PoliteFetcher,
  LoginRequiredError,
  SessionMissingError,
  crawlTeam,
  defaultSessionPath,
  extractOpponentPar1s,
  harvestPlayerPar1s,
  initSessionTemplate,
  loadSession,
  parsePlayerProfile,
  parsePlayerSearch,
  parseRatingSearch,
  parseRobots,
  parseTeamSearch,
  parseTennisrecordHistory,
  playerProfileUrl,
  teamProfileUrl,
  tennisrecordHistoryUrl,
  type TennisrecordMatchRow,
  type PlayerPar1Entry,
  type UstaSession,
} from "@tennis/scraper";
import {
  computePerfRatings,
  computeRatings,
  labeledRows,
  loadCaptures,
  loadCapturesMulti,
  DEFAULT_NTRP_TO_GLICKO_PRIOR,
} from "@tennis/calibrate";
import { fitCalibration, glickoToNtrp } from "@tennis/ratings";

const ENV_CONTACT = process.env.TENNIS_CONTACT_EMAIL;
const ENV_UA = process.env.TENNIS_USER_AGENT ?? "TennisPlatform/0.1";

function requireContact(): string {
  if (!ENV_CONTACT) {
    console.error(
      "Missing TENNIS_CONTACT_EMAIL env var. Required for polite crawling so site\n" +
        "admins can reach us if our crawler causes issues."
    );
    process.exit(2);
  }
  return ENV_CONTACT;
}

// Anonymous fetcher. For public pages only — don't use against auth-walled URLs.
function anonFetcher(): PoliteFetcher {
  return new PoliteFetcher({
    userAgent: ENV_UA,
    contactEmail: requireContact(),
  });
}

// Authenticated fetcher. Loads ~/.tennis-platform/usta-session.json and sends
// the Cookie + UA verbatim with every request.
async function authFetcher(
  overrides: { minDelayMs?: number; maxDelayMs?: number } = {}
): Promise<{ fetcher: PoliteFetcher; session: UstaSession }> {
  const session = await loadSession();
  const fetcher = new PoliteFetcher({
    userAgent: session.userAgent,
    contactEmail: session.contactEmail,
    cookieHeader: session.cookieHeader,
    ...overrides,
  });
  return { fetcher, session };
}

async function capture(url: string, outPath: string, useAuth: boolean) {
  const fetcher = useAuth ? (await authFetcher()).fetcher : anonFetcher();
  console.error(`Fetching ${url}  (auth=${useAuth})`);
  const result = await fetcher.fetch(url);
  console.error(
    `  status=${result.status} bytes=${result.body?.length ?? 0} etag=${
      result.etag ?? "-"
    }`
  );
  if (!result.body) {
    console.error("No body to write (304 Not Modified).");
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.body, "utf8");
  console.error(`Wrote ${outPath}`);
}

// Follow an ASP.NET WebForms __doPostBack and write the response HTML. The
// eventTarget is the unique id of the postback control as it appears in
// the page source — e.g. for a player roster click:
//   ctl00$mainContent$rptPlayersForTeam$ctl06$LinkButton17
async function capturePostback(
  url: string,
  eventTarget: string,
  outPath: string
) {
  const { fetcher } = await authFetcher();
  console.error(`Postback ${url}`);
  console.error(`  __EVENTTARGET=${eventTarget}`);
  const result = await fetcher.postEventTarget(url, eventTarget);
  console.error(
    `  status=${result.status} bytes=${result.body?.length ?? 0}`
  );
  if (!result.body) {
    console.error("No body to write.");
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.body, "utf8");
  console.error(`Wrote ${outPath}`);
}

async function parse(kind: string, htmlFile: string) {
  const html = await readFile(htmlFile, "utf8");
  switch (kind) {
    case "search": {
      const rows = parsePlayerSearch(html);
      console.log(JSON.stringify(rows, null, 2));
      console.error(`Parsed ${rows.length} search rows.`);
      break;
    }
    case "robots": {
      const rules = parseRobots(html);
      console.log(JSON.stringify(rules, null, 2));
      break;
    }
    case "rating-search": {
      const result = parseRatingSearch(html);
      console.log(JSON.stringify(result, null, 2));
      console.error(
        `Parsed ${result.rows.length} rows from "${result.context ?? "?"}"`
      );
      break;
    }
    case "team-search": {
      const result = parseTeamSearch(html);
      console.log(JSON.stringify(result, null, 2));
      console.error(
        `Parsed ${result.rows.length} team rows from "${result.context ?? "?"}"`
      );
      break;
    }
    case "tr-history": {
      const result = parseTennisrecordHistory(html);
      console.log(JSON.stringify(result, null, 2));
      console.error(
        `Parsed ${result.rows.length} tennisrecord match rows for ${
          result.playerName ?? "?"
        }`
      );
      break;
    }
    default:
      console.error(`Unknown parser kind: ${kind}`);
      console.error(
        "Available: search, robots, rating-search, team-search, tr-history"
      );
      process.exit(2);
  }
}

async function robots(host: string) {
  const fetcher = anonFetcher();
  const url = `https://${host}/robots.txt`;
  const result = await fetcher.fetch(url);
  if (result.body) {
    console.log(result.body);
  } else {
    console.error(`Status ${result.status}, no body.`);
  }
}

async function sessionInit() {
  const path = defaultSessionPath();
  const { created } = await initSessionTemplate(path);
  if (created) {
    console.error(`Wrote session template to ${path}`);
    console.error(
      "Open it, paste your browser's Cookie header + User-Agent, then run\n" +
        "  tennis-scrape session check"
    );
  } else {
    console.error(`Session file already exists at ${path}`);
    console.error("Edit it directly to refresh cookies; nothing was overwritten.");
  }
}

async function sessionCheck(probeUrl?: string) {
  const { fetcher, session } = await authFetcher();
  // Default probe: a known auth-walled URL. The user can override by passing
  // their own team URL — useful right after pasting cookies to confirm the
  // session works against their specific team.
  const url =
    probeUrl ??
    teamProfileUrl({
      // Placeholder par1 — without a real team id we still test the auth
      // wall behavior: a logged-in session gets RecordNotFound, an
      // un-logged-in session gets a login redirect.
      par1: "0000000000000000000000000000000000000000000",
      year: new Date().getFullYear(),
    });
  console.error(`Probing ${url}`);
  console.error(`Session fetched at: ${session.fetchedAt}`);
  try {
    const result = await fetcher.fetch(url);
    // If we get any non-login response, the cookies are valid. The body
    // might be the RecordNotFound page (placeholder team id) but that's
    // still "logged in" — the auth wall would have redirected first.
    const looksLikeLogin =
      result.body?.includes("account.usta.com") ||
      result.body?.includes("Auth0") ||
      result.body?.includes("Sign in to TennisLink");
    if (looksLikeLogin) {
      console.error("✗ Response body looks like a login page. Cookies appear invalid.");
      process.exit(1);
    }
    console.error(
      `✓ Session works (status=${result.status}, ${result.body?.length ?? 0} bytes returned).`
    );
  } catch (err) {
    if (err instanceof LoginRequiredError) {
      console.error("✗ Auth wall hit — cookies are missing or expired.");
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

// Crawl a single team end-to-end: GET the team profile, parse it, extract
// ViewState ids, then GET every completed-match scorecard linked from the
// schedule. Writes raw HTML to captures/raw/{teamKey}/{ts}/ and the parsed
// result to captures/parsed/{teamKey}/{ts}.json.
//
// teamKey is the canonical 10-digit numeric team id when we recover one
// from the ViewState; otherwise it's the par1 (opaque hex). We use it so
// crawls of the same team co-locate on disk regardless of which par1 was
// the entry point.
async function crawlTeamCmd(
  par1: string,
  year: number,
  opts: { rootDir: string }
) {
  // 3s minimum delay per session preference (conservative crawl rate).
  const { fetcher } = await authFetcher({ minDelayMs: 3000, maxDelayMs: 5000 });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  // Stage raw HTML in a tmp dir keyed by par1; we'll rename to the canonical
  // teamId once the team profile parse gives us one.
  const stagingKey = `par1-${par1.slice(0, 12)}`;
  let rawDir = join(opts.rootDir, "raw", stagingKey, ts);
  await mkdir(rawDir, { recursive: true });

  console.error(`Crawling team par1=${par1} year=${year}`);
  console.error(`  raw → ${rawDir}`);

  const result = await crawlTeam(
    fetcher,
    { par1, year },
    {
      async onRawHtml(kind, id, html) {
        const file =
          kind === "team-profile"
            ? join(rawDir, "team-profile.html")
            : join(rawDir, `match-${id}.html`);
        await writeFile(file, html, "utf8");
      },
    }
  );

  // If we recovered a canonical teamId, rename raw dir to use it.
  const teamKey = result.teamId ?? stagingKey;
  if (result.teamId && result.teamId !== stagingKey) {
    const finalRaw = join(opts.rootDir, "raw", teamKey, ts);
    await mkdir(dirname(finalRaw), { recursive: true });
    const { rename } = await import("node:fs/promises");
    try {
      await rename(rawDir, finalRaw);
      rawDir = finalRaw;
    } catch {
      // Non-fatal: leave the staging-keyed dir alone if rename collides.
    }
  }

  const parsedFile = join(opts.rootDir, "parsed", teamKey, `${ts}.json`);
  await mkdir(dirname(parsedFile), { recursive: true });
  await writeFile(parsedFile, JSON.stringify(result, null, 2) + "\n", "utf8");

  console.error(
    `  team: ${result.teamProfile.header.teamName} (id=${
      result.teamId ?? "unknown"
    })`
  );
  console.error(
    `  schedule: ${result.teamProfile.schedule.length} matches; ` +
      `fetched ${result.scorecards.length} scorecards; ${result.errors.length} errors`
  );
  console.error(`  parsed → ${parsedFile}`);
  if (result.errors.length) {
    for (const e of result.errors) {
      console.error(`  ! ${e.step} ${e.matchId ?? ""}: ${e.message}`);
    }
  }
}

// Crawl every team in a subflight by first harvesting opponent par1s
// via Chromium (Playwright clickPostback through the standings table),
// then running the regular crawlTeam pipeline against each.
//
// Output layout under {rootDir}:
//   raw/{ownTeamId}-subflight/{ts}/par1s.json
//   raw/{ownTeamId}-subflight/{ts}/teams/{teamId}/team-profile.html
//   raw/{ownTeamId}-subflight/{ts}/teams/{teamId}/match-{id}.html
//   parsed/{ownTeamId}-subflight/{ts}.json
async function crawlSubflightCmd(
  par1: string,
  year: number,
  opts: { rootDir: string; includePlayers: boolean }
) {
  const session = await loadSession();
  const ownProfileUrl = teamProfileUrl({ par1, year });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const stagingKey = `par1-${par1.slice(0, 12)}-subflight`;
  let subflightDir = join(opts.rootDir, "raw", stagingKey, ts);
  await mkdir(subflightDir, { recursive: true });
  console.error(`Subflight crawl: par1=${par1} year=${year}`);
  console.error(`  staging dir: ${subflightDir}`);
  console.error(`  include players: ${opts.includePlayers}`);
  const totalPhases = opts.includePlayers ? 4 : 2;

  // Browser stays alive across all Playwright phases — Phase 1 (opponent
  // par1 harvest) and, if --include-players, Phase 3 (player par1
  // harvest). Closed in the outer finally.
  const browser = new BrowserFetcher({
    session,
    minDelayMs: 3000,
    maxDelayMs: 5000,
  });
  try {

  // Phase 1: harvest opponent par1s via browser.
  console.error(`Phase 1/${totalPhases}: harvesting opponent par1s via Chromium...`);
  const harvest = await extractOpponentPar1s(browser, ownProfileUrl);
  await writeFile(
    join(subflightDir, "par1s.json"),
    JSON.stringify(harvest, null, 2) + "\n",
    "utf8"
  );
  console.error(
    `  own team: "${harvest.ownTeamName}" par1=${harvest.ownPar1 ?? "?"}`
  );
  console.error(
    `  recovered ${harvest.opponents.length} opponent par1s; ${harvest.errors.length} errors`
  );
  for (const e of harvest.errors) {
    console.error(`  ! ${e.teamName}: ${e.message}`);
  }

  // Phase 2: run crawlTeam against each team via PoliteFetcher.
  console.error(`Phase 2/${totalPhases}: crawling each team via PoliteFetcher...`);
  const fetcher = new PoliteFetcher({
    userAgent: session.userAgent,
    contactEmail: session.contactEmail,
    cookieHeader: session.cookieHeader,
    minDelayMs: 3000,
    maxDelayMs: 5000,
  });
  const allTargets: Array<{ teamName: string; par1: string }> = [
    ...(harvest.ownPar1
      ? [{ teamName: harvest.ownTeamName, par1: harvest.ownPar1 }]
      : []),
    ...harvest.opponents,
  ];
  const teamResults: Array<{
    teamName: string;
    par1: string;
    ok: boolean;
    teamId?: string | undefined;
    error?: string;
    scorecardCount?: number;
  }> = [];
  const teamsRoot = join(subflightDir, "teams");
  await mkdir(teamsRoot, { recursive: true });

  for (const target of allTargets) {
    console.error(`  - ${target.teamName} (par1=${target.par1.slice(0, 14)}...)`);
    // Tmp staging by par1 prefix; promote to canonical teamId once known.
    let teamRaw = join(teamsRoot, `par1-${target.par1.slice(0, 12)}`);
    await mkdir(teamRaw, { recursive: true });
    try {
      const result = await crawlTeam(
        fetcher,
        { par1: target.par1, year },
        {
          async onRawHtml(kind, id, html) {
            const file =
              kind === "team-profile"
                ? join(teamRaw, "team-profile.html")
                : join(teamRaw, `match-${id}.html`);
            await writeFile(file, html, "utf8");
          },
        }
      );
      const teamKey = result.teamId ?? `par1-${target.par1.slice(0, 12)}`;
      if (result.teamId) {
        const finalRaw = join(teamsRoot, teamKey);
        try {
          const { rename } = await import("node:fs/promises");
          await rename(teamRaw, finalRaw);
          teamRaw = finalRaw;
        } catch {
          // non-fatal
        }
      }
      // Write parsed per-team JSON inside the team dir too.
      await writeFile(
        join(teamRaw, "parsed.json"),
        JSON.stringify(result, null, 2) + "\n",
        "utf8"
      );
      teamResults.push({
        teamName: target.teamName,
        par1: target.par1,
        ok: true,
        teamId: result.teamId,
        scorecardCount: result.scorecards.length,
      });
      console.error(
        `    ok: ${result.scorecards.length} scorecards, ${result.errors.length} scorecard errors`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      teamResults.push({
        teamName: target.teamName,
        par1: target.par1,
        ok: false,
        error: message,
      });
      console.error(`    ERROR: ${message}`);
    }
  }

  // Promote subflight dir to own teamId once known (first ok team is
  // typically self).
  const ownTeamId = teamResults.find(
    (t) => t.teamName === harvest.ownTeamName
  )?.teamId;
  if (ownTeamId) {
    const finalDir = join(opts.rootDir, "raw", `${ownTeamId}-subflight`, ts);
    try {
      await mkdir(dirname(finalDir), { recursive: true });
      const { rename } = await import("node:fs/promises");
      await rename(subflightDir, finalDir);
      subflightDir = finalDir;
    } catch {
      // non-fatal
    }
  }
  const subflightKey = ownTeamId
    ? `${ownTeamId}-subflight`
    : stagingKey;

  // Phase 3 + 4 (optional): per-team player par1 discovery, then
  // per-player profile fetch. Both are deduped across teams by USTA
  // member id — a player on multiple teams is fetched once.
  const playerResults: Array<{
    name: string;
    memberId: string | undefined;
    playerPar1: string;
    teams: string[]; // team names where this player appears
    ok: boolean;
    matchCount?: number;
    error?: string;
  }> = [];
  if (opts.includePlayers) {
    // Map memberId (or name fallback) → entry so re-encounters across
    // teams just append to .teams[] instead of double-fetching.
    const byKey = new Map<
      string,
      { entry: PlayerPar1Entry; teams: string[] }
    >();
    console.error(
      `Phase 3/${totalPhases}: harvesting player par1s via Chromium (per team rosters)...`
    );
    for (const target of allTargets) {
      const target_team_url = teamProfileUrl({ par1: target.par1, year });
      console.error(`  roster of ${target.teamName}...`);
      try {
        const rosterResult = await harvestPlayerPar1s(browser, target_team_url);
        console.error(
          `    recovered ${rosterResult.players.length} player par1s; ${rosterResult.errors.length} errors`
        );
        for (const e of rosterResult.errors) {
          console.error(`    ! ${e.name}: ${e.message}`);
        }
        for (const p of rosterResult.players) {
          const key = p.memberId ?? `name:${p.name}`;
          const existing = byKey.get(key);
          if (existing) {
            existing.teams.push(rosterResult.teamName);
          } else {
            byKey.set(key, { entry: p, teams: [rosterResult.teamName] });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`    ERROR: ${message}`);
      }
    }
    console.error(
      `  unique players across subflight: ${byKey.size}`
    );

    // Phase 4: PoliteFetcher each unique player profile. Persist raw +
    // parsed under raw/{subflightDir}/players/{memberId-or-par1}/.
    console.error(
      `Phase 4/${totalPhases}: fetching unique player profiles via PoliteFetcher...`
    );
    const playersRoot = join(subflightDir, "players");
    await mkdir(playersRoot, { recursive: true });
    for (const { entry, teams } of byKey.values()) {
      const key = entry.memberId ?? entry.playerPar1.slice(0, 12);
      const playerDir = join(playersRoot, key);
      await mkdir(playerDir, { recursive: true });
      const url = playerProfileUrl({ par1: entry.playerPar1, year });
      try {
        const res = await fetcher.fetch(url);
        if (!res.body) {
          playerResults.push({
            name: entry.name,
            memberId: entry.memberId,
            playerPar1: entry.playerPar1,
            teams,
            ok: false,
            error: `empty body (status ${res.status})`,
          });
          console.error(
            `    ${entry.name}: empty body (status ${res.status})`
          );
          continue;
        }
        await writeFile(join(playerDir, "profile.html"), res.body, "utf8");
        const parsed = parsePlayerProfile(res.body);
        await writeFile(
          join(playerDir, "parsed.json"),
          JSON.stringify({ teams, ...parsed }, null, 2) + "\n",
          "utf8"
        );
        playerResults.push({
          name: entry.name,
          memberId: entry.memberId,
          playerPar1: entry.playerPar1,
          teams,
          ok: true,
          matchCount: parsed.matches.length,
        });
        console.error(
          `    ${entry.name}: ${parsed.matches.length} matches across ${teams.length} team(s)`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        playerResults.push({
          name: entry.name,
          memberId: entry.memberId,
          playerPar1: entry.playerPar1,
          teams,
          ok: false,
          error: message,
        });
        console.error(`    ${entry.name}: ERROR ${message}`);
      }
    }
  }

  // Write the parsed aggregate. Pointers to per-team blobs instead of
  // inlining all parsed teams (~MBs) to keep the aggregate browsable.
  const aggregate = {
    fetchedAt: new Date().toISOString(),
    year,
    ownTeamName: harvest.ownTeamName,
    ownPar1: harvest.ownPar1,
    ownTeamId,
    rawDir: subflightDir,
    teams: teamResults,
    players: opts.includePlayers ? playerResults : undefined,
    par1HarvestErrors: harvest.errors,
  };
  const parsedFile = join(
    opts.rootDir,
    "parsed",
    subflightKey,
    `${ts}.json`
  );
  await mkdir(dirname(parsedFile), { recursive: true });
  await writeFile(parsedFile, JSON.stringify(aggregate, null, 2) + "\n", "utf8");
  console.error(`Wrote ${parsedFile}`);
  const successCount = teamResults.filter((t) => t.ok).length;
  console.error(
    `Subflight crawl complete: ${successCount}/${teamResults.length} teams ok` +
      (opts.includePlayers
        ? `, ${playerResults.filter((p) => p.ok).length}/${playerResults.length} players ok`
        : "")
  );
  } finally {
    await browser.close();
  }
}

// Follow a __doPostBack through a real Chromium so USTA's CSRF-reinit JS
// runs. Writes the resulting page's HTML (and prints its final URL).
// Use this when capture-postback (static replay) returns the wrong page.
async function browserPostback(
  url: string,
  eventTarget: string,
  outPath: string
) {
  const session = await loadSession();
  const fetcher = new BrowserFetcher({ session });
  try {
    console.error(`Browser-postback ${url}`);
    console.error(`  __EVENTTARGET=${eventTarget}`);
    const result = await fetcher.clickPostback(url, eventTarget);
    console.error(`  status=${result.status} finalUrl=${result.finalUrl}`);
    if (!result.body) {
      console.error("No body to write.");
      return;
    }
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, result.body, "utf8");
    console.error(`Wrote ${outPath}`);
  } finally {
    await fetcher.close();
  }
}

// USTA-style performance-rating model. Output is on the NTRP scale by
// construction — no linear fit needed. We just report the per-band
// mean/median of computed ratings as a sanity check (do labeled-3.0
// players have computed ratings near 3.0?), and write the per-player
// ratings file.
async function ratingsFitPerf(
  aggregatePaths: string[],
  captures: import("@tennis/calibrate").CapturesData,
  minMatches: number
) {
  console.error(
    "Running chronological per-match performance-rating update " +
      "(USTA-style; output on NTRP scale)..."
  );
  const result = computePerfRatings(captures);
  console.error(
    `  computed ${result.ratings.size} ratings; skipped ${result.skipped} matches (no winner)`
  );
  // Filter to labeled players with enough match history for the report.
  const labeled: Array<{
    key: string;
    name: string;
    ntrp: number;
    matches: number;
    perfRating: number;
  }> = [];
  for (const p of captures.players.values()) {
    if (p.ntrp === undefined) continue;
    const hist = result.history.get(p.key);
    if (!hist || hist.length < minMatches) continue;
    labeled.push({
      key: p.key,
      name: p.name,
      ntrp: p.ntrp,
      matches: hist.length,
      perfRating: result.ratings.get(p.key)!,
    });
  }
  console.error(
    `  ${labeled.length} players with NTRP label and ≥${minMatches} matches`
  );
  if (labeled.length === 0) {
    console.error("No labeled players to summarize. Aborting.");
    process.exit(1);
  }
  // Per-band stats.
  console.error("Predicted NTRP by labeled level (no fit step — output IS NTRP):");
  const byLevel = new Map<number, number[]>();
  for (const r of labeled) {
    const arr = byLevel.get(r.ntrp) ?? [];
    arr.push(r.perfRating);
    byLevel.set(r.ntrp, arr);
  }
  // Overall RMSE: predicted vs label.
  let sse = 0;
  for (const r of labeled) sse += (r.perfRating - r.ntrp) ** 2;
  const rmse = Math.sqrt(sse / labeled.length);
  console.error(`  overall RMSE ${rmse.toFixed(4)} over ${labeled.length} players`);
  for (const level of [...byLevel.keys()].sort()) {
    const preds = byLevel.get(level)!;
    const mean = preds.reduce((a, b) => a + b, 0) / preds.length;
    const sorted = [...preds].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const p10 = sorted[Math.floor(sorted.length * 0.1)]!;
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    console.error(
      `  label ${level}: n=${preds.length} mean=${mean.toFixed(3)} ` +
        `median=${median.toFixed(3)} p10=${p10.toFixed(3)} p90=${p90.toFixed(3)}`
    );
  }
  // Write per-player ratings JSON alongside the first aggregate.
  const primary = aggregatePaths[0]!;
  const stem = primary.endsWith(".json") ? primary.slice(0, -5) : primary;
  const ratingsPath = `${stem}.perf-ratings.json`;
  const dump = [...result.ratings.entries()].map(([key, perf]) => {
    const p = captures.players.get(key);
    const hist = result.history.get(key) ?? [];
    return {
      key,
      name: p?.name,
      memberId: p?.memberId,
      ntrpLabel: p?.ntrp,
      teams: p?.teams ?? [],
      perfRating: perf,
      matches: hist.length,
      // Recent 5 perf entries for spot-check.
      recentMatches: hist.slice(-5).map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        perf: e.perf,
        opponent: e.opponentRating,
        gamesDiff: e.gamesDiff,
      })),
    };
  });
  await writeFile(ratingsPath, JSON.stringify(dump, null, 2) + "\n", "utf8");
  console.error(`Wrote ${ratingsPath}`);
}

// Run the full ratings pipeline against a parsed subflight aggregate:
// load captures → chronological Glicko → fit Glicko→NTRP linear
// regression against labeled rosters. Prints a summary table and a
// fit-quality report; writes calibration.json + ratings.json next to
// the input.
async function ratingsFitCmd(
  aggregatePaths: string[],
  opts: {
    minMatches: number;
    labelsPath?: string;
    priorFromNtrp: boolean;
    model: "glicko" | "perf";
  }
) {
  if (aggregatePaths.length === 1) {
    console.error(`Loading captures from ${aggregatePaths[0]}`);
  } else {
    console.error(`Loading ${aggregatePaths.length} aggregates (union):`);
    for (const p of aggregatePaths) console.error(`  ${p}`);
  }
  if (opts.labelsPath) {
    console.error(`  with year-end labels: ${opts.labelsPath}`);
  }
  const captures = await loadCapturesMulti(aggregatePaths, {
    yearEndLabelsPath: opts.labelsPath,
  });
  console.error(
    `  ${captures.players.size} players, ${captures.matches.length} court matches`
  );
  if (captures.unresolvedNames.length > 0) {
    console.error(
      `  ${captures.unresolvedNames.length} unresolved scorecard names (won't get NTRP labels)`
    );
  }
  if (opts.labelsPath) {
    console.error(
      `  year-end labels: ${captures.yearEndLabelMatches} matched (${captures.yearEndLabelOverrides} differed from roster), ${captures.yearEndUnmatched} dump rows unmatched`
    );
  }

  if (opts.model === "perf") {
    return ratingsFitPerf(aggregatePaths, captures, opts.minMatches);
  }

  console.error(
    `Running chronological Glicko-2 update${
      opts.priorFromNtrp ? " (priors seeded from NTRP labels)" : ""
    }...`
  );
  const result = computeRatings(captures, {
    ntrpToGlickoPrior: opts.priorFromNtrp
      ? DEFAULT_NTRP_TO_GLICKO_PRIOR
      : undefined,
  });
  console.error(
    `  computed ${result.ratings.size} ratings; skipped ${result.skipped} matches (no winner)`
  );

  const rows = labeledRows(captures, result, { minMatches: opts.minMatches });
  console.error(
    `  ${rows.length} players with NTRP label and ≥${opts.minMatches} matches`
  );
  if (rows.length < 10) {
    console.error("Not enough labeled players to fit (need ≥10). Aborting.");
    process.exit(1);
  }

  // NTRP labels in our data come from the team roster — those are
  // typically the *level the player plays at* (3.5, 4.0, etc.), not a
  // continuous rating. Treat them as discrete bands for the fit.
  const calib = fitCalibration(
    rows.map((r) => ({ glickoRating: r.rating, ntrpLevel: r.ntrp }))
  );
  console.error(
    `Fit: NTRP ≈ ${calib.slope.toFixed(6)} * glicko + ${calib.intercept.toFixed(4)}`
  );
  console.error(`     RMSE ${calib.rmse.toFixed(4)} over ${calib.sampleSize} players`);

  // Per-band predicted ranges (useful sanity-check: does the fit place
  // 3.5 players inside the 3.0–3.5 NTRP band?).
  const byLevel = new Map<number, number[]>();
  for (const r of rows) {
    const arr = byLevel.get(r.ntrp) ?? [];
    arr.push(glickoToNtrp(r.rating, calib));
    byLevel.set(r.ntrp, arr);
  }
  console.error("Predicted NTRP by labeled level:");
  for (const level of [...byLevel.keys()].sort()) {
    const preds = byLevel.get(level)!;
    const mean = preds.reduce((a, b) => a + b, 0) / preds.length;
    const sorted = [...preds].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const p10 = sorted[Math.floor(sorted.length * 0.1)]!;
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    console.error(
      `  label ${level}: n=${preds.length} mean=${mean.toFixed(3)} ` +
        `median=${median.toFixed(3)} p10=${p10.toFixed(3)} p90=${p90.toFixed(3)}`
    );
  }

  // Write outputs alongside the first aggregate (the "primary" of a
  // multi-aggregate union, or the only one in the single-input case).
  const primary = aggregatePaths[0]!;
  const stem = primary.endsWith(".json") ? primary.slice(0, -5) : primary;
  const calibPath = `${stem}.calibration.json`;
  const ratingsPath = `${stem}.ratings.json`;
  await writeFile(calibPath, JSON.stringify(calib, null, 2) + "\n", "utf8");

  const ratingsDump = [...result.ratings.entries()].map(([key, r]) => {
    const player = captures.players.get(key);
    return {
      key,
      name: player?.name,
      memberId: player?.memberId,
      ntrpLabel: player?.ntrp,
      teams: player?.teams ?? [],
      rating: r.rating,
      rd: r.rd,
      vol: r.vol,
      matches: result.matchCounts.get(key) ?? 0,
      predictedNtrp: glickoToNtrp(r.rating, calib),
    };
  });
  ratingsDump.sort((a, b) => b.rating - a.rating);
  await writeFile(
    ratingsPath,
    JSON.stringify(ratingsDump, null, 2) + "\n",
    "utf8"
  );
  console.error(`Wrote ${calibPath}`);
  console.error(`Wrote ${ratingsPath}`);
}

// Submit the team-search form via Playwright with the given criteria,
// dump the rendered HTML, and parse it to extract team par1s. Writes
// both the raw HTML (for fixture purposes) and the parsed JSON.
async function searchTeamsCmd(opts: {
  year: number;
  section: string;
  division: string;
  gender: "Male" | "Female" | "Mixed";
  level?: string;
  outHtml: string;
  outJson?: string;
  extractPar1ForTeamSubstring?: string;
}) {
  const session = await loadSession();
  const browser = new BrowserFetcher({ session });
  try {
    console.error(
      `Searching teams: year=${opts.year} section="${opts.section}" ` +
        `division="${opts.division}" gender=${opts.gender} ` +
        `level=${opts.level ?? "(all)"}`
    );
    const result = await browser.submitTeamSearch({
      year: opts.year,
      section: opts.section,
      division: opts.division,
      gender: opts.gender,
      level: opts.level,
      extractPar1ForTeamSubstring: opts.extractPar1ForTeamSubstring,
    });
    await mkdir(dirname(opts.outHtml), { recursive: true });
    await writeFile(opts.outHtml, result.body ?? "", "utf8");
    console.error(`  status=${result.status} bytes=${result.body?.length ?? 0}`);
    console.error(`  finalUrl=${result.finalUrl}`);
    console.error(`Wrote ${opts.outHtml}`);
    const parsed = parseTeamSearch(result.body ?? "");
    console.error(`Parsed ${parsed.rows.length} teams from results page`);
    if (opts.outJson) {
      await mkdir(dirname(opts.outJson), { recursive: true });
      await writeFile(
        opts.outJson,
        JSON.stringify(parsed, null, 2) + "\n",
        "utf8"
      );
      console.error(`Wrote ${opts.outJson}`);
    }
    if (result.extractedPar1) {
      console.error(
        `\nExtracted par1 for "${result.extractedTeamName}":\n  ${result.extractedPar1}`
      );
    }
  } finally {
    await browser.close();
  }
}

// Fetch tennisrecord match histories for a list of players and
// aggregate empirical (score → delta) statistics. Used to reverse-
// engineer the perf-rating table.
//
// `aggregatePaths` are subflight aggregate JSON files; we read their
// rosters to pick player names. `year` selects which year's history
// to pull per player (e.g. 2025 — must be a completed season to have
// final match ratings).
async function tennisrecordAggregateCmd(opts: {
  aggregatePaths: string[];
  year: number;
  outJson: string;
  maxPlayers: number;
  minDelayMs: number;
  maxDelayMs: number;
}) {
  // Use the existing captures loader to get rostered player names —
  // it handles raw-dir derivation and roster aggregation correctly.
  const captures = await loadCapturesMulti(opts.aggregatePaths);
  const playerList: Array<{ name: string; teams: string[] }> = [];
  for (const p of captures.players.values()) {
    if (!p.name) continue;
    if (p.teams.length === 0) continue; // skip unresolved scorecard names
    playerList.push({ name: p.name, teams: p.teams });
  }
  console.error(`Found ${playerList.length} unique players across aggregates`);
  if (playerList.length > opts.maxPlayers) {
    console.error(`  capped at --max-players=${opts.maxPlayers}`);
    playerList.length = opts.maxPlayers;
  }

  // Fetch each player's history (polite). Use anonymous PoliteFetcher.
  const fetcher = anonFetcher();
  // Override delays via the fetcher's pacing — re-construct with desired.
  const politeFetcher = new PoliteFetcher({
    userAgent: ENV_UA,
    contactEmail: requireContact(),
    minDelayMs: opts.minDelayMs,
    maxDelayMs: opts.maxDelayMs,
  });
  void fetcher;

  // Per-player results + global score aggregation.
  const perPlayer: Array<{
    player: string;
    teams: string[];
    rows: TennisrecordMatchRow[];
    error?: string;
  }> = [];

  // Aggregate keyed by canonical sorted "won-lost,won-lost" from
  // winner's perspective, only counting matches with a non-null
  // matchRating + opponent rating, and only matches with sets.
  const scoreStats = new Map<
    string,
    {
      deltas: number[];
      sample: Array<{
        player: string;
        opp: string;
        oppRating: number;
        matchRating: number;
        score: string;
      }>;
    }
  >();

  let i = 0;
  for (const p of playerList) {
    i += 1;
    const url = tennisrecordHistoryUrl(p.name, opts.year);
    try {
      const result = await politeFetcher.fetch(url);
      if (!result.body) {
        perPlayer.push({ player: p.name, teams: p.teams, rows: [], error: "no body" });
        continue;
      }
      const parsed = parseTennisrecordHistory(result.body);
      perPlayer.push({ player: p.name, teams: p.teams, rows: parsed.rows });
      // Aggregate deltas per score.
      for (const row of parsed.rows) {
        if (row.matchRating === undefined) continue;
        if (row.opponents.length === 0) continue;
        // For doubles, the opponent's rating is the mean of two.
        const oppRatings = row.opponents
          .map((o) => o.rating)
          .filter((r): r is number => r !== undefined);
        if (oppRatings.length === 0) continue;
        const oppMean = oppRatings.reduce((a, b) => a + b, 0) / oppRatings.length;
        // Canonical key: tennisrecord's Result column is ALWAYS shown
        // in winner's perspective (winner-games first), regardless of
        // which side the player on this page was on. So row.sets is
        // already winner-perspective; no flip needed.
        const winnerSets = row.sets;
        // Drop matches that we don't understand (no sets parsed).
        if (winnerSets.length === 0) continue;
        const sortedSets = [...winnerSets].sort((a, b) => {
          if (a.playerGames !== b.playerGames)
            return a.playerGames - b.playerGames;
          return a.opponentGames - b.opponentGames;
        });
        const key = sortedSets
          .map((s) => `${s.playerGames}-${s.opponentGames}`)
          .join(",");
        const delta = row.won
          ? row.matchRating - oppMean
          : oppMean - row.matchRating;
        const entry = scoreStats.get(key) ?? { deltas: [], sample: [] };
        entry.deltas.push(delta);
        if (entry.sample.length < 5) {
          entry.sample.push({
            player: p.name,
            opp: row.opponents.map((o) => o.name).join(" + "),
            oppRating: oppMean,
            matchRating: row.matchRating,
            score: key,
          });
        }
        scoreStats.set(key, entry);
      }
      console.error(
        `[${i}/${playerList.length}] ${p.name}: ${parsed.rows.length} matches`
      );
    } catch (err) {
      perPlayer.push({
        player: p.name,
        teams: p.teams,
        rows: [],
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[${i}/${playerList.length}] ${p.name}: ERROR ${err}`);
    }
  }

  // Summarize per score.
  const summary = [...scoreStats.entries()]
    .map(([key, v]) => {
      const xs = v.deltas;
      xs.sort((a, b) => a - b);
      const n = xs.length;
      const mean = xs.reduce((a, b) => a + b, 0) / n;
      const median = xs[Math.floor(n / 2)]!;
      const p10 = xs[Math.floor(n * 0.1)]!;
      const p90 = xs[Math.floor(n * 0.9)]!;
      return {
        score: key,
        n,
        mean,
        median,
        p10,
        p90,
        sample: v.sample,
      };
    })
    .sort((a, b) => b.n - a.n);

  await writeFile(
    opts.outJson,
    JSON.stringify(
      { year: opts.year, perPlayer, summary },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.error(`Wrote ${opts.outJson}`);
  console.error("Top 15 score patterns by frequency:");
  for (const s of summary.slice(0, 15)) {
    console.error(
      `  ${s.score.padEnd(20)} n=${String(s.n).padEnd(4)} ` +
        `mean=${s.mean.toFixed(3)} median=${s.median.toFixed(3)} ` +
        `p10=${s.p10.toFixed(3)} p90=${s.p90.toFixed(3)}`
    );
  }
}

function usage(): never {
  console.error(`Usage:
  tennis-scrape capture <url> <out-file> [--no-auth]
  tennis-scrape capture-postback <url> <event-target> <out-file>
  tennis-scrape browser-postback <url> <event-target> <out-file>
  tennis-scrape parse <kind> <html-file>     (kind: search|robots|rating-search|team-search)
  tennis-scrape search teams <out-html> --year N --section LABEL --division LABEL --gender Male|Female|Mixed --level LEVEL [--out-json PATH] [--extract-par1-for "team name substring"]
                       (live Playwright form submit; level required. --extract-par1-for clicks the first matching team row's postback and prints its par1.)
  tennis-scrape robots <host>
  tennis-scrape session init
  tennis-scrape session check [probe-url]
  tennis-scrape crawl team <par1> <year> [--out <dir>]   (default --out: ./captures)
  tennis-scrape crawl subflight <par1> <year> [--out <dir>] [--include-players]
  tennis-scrape ratings fit <subflight-aggregate.json> [<more-aggregates.json>...] [--min-matches N] [--labels <year-end.json>] [--prior-from-ntrp] [--model glicko|perf]
  tennis-scrape tennisrecord aggregate <subflight-aggregate.json> [<more-aggregates.json>...] --year YEAR --out OUTPUT.json [--max-players N] [--min-delay MS] [--max-delay MS]
                       (fetches tennisrecord match histories for rostered players, aggregates empirical score → perf-delta stats; polite delays default 2000–4000 ms)
                       (--prior-from-ntrp seeds initial Glicko per player from their NTRP band — required for multi-band fits across disjoint subflights, otherwise the bands collapse to one prior)
                       (--model perf uses USTA-style per-match performance ratings on the NTRP scale; score margin matters and the disjoint-cluster problem doesn't apply)
                       (multiple aggregates are unioned: e.g. 3.0 + 3.5 + 4.0 subflights → one fit)

Env:
  TENNIS_CONTACT_EMAIL  email site admins can use to reach you
                        (anonymous fetches only; auth fetches use the session file)
  TENNIS_USER_AGENT     UA for anonymous fetches; default 'TennisPlatform/0.1'
  TENNIS_SESSION_FILE   override the default session path
                        (default: ~/.tennis-platform/usta-session.json)
`);
  process.exit(2);
}

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "capture": {
        const args = [sub, ...rest].filter(Boolean);
        const noAuth = args.includes("--no-auth");
        const positional = args.filter((a) => a !== "--no-auth");
        if (positional.length !== 2) usage();
        await capture(positional[0]!, positional[1]!, !noAuth);
        break;
      }
      case "capture-postback": {
        if (!sub || rest.length !== 2) usage();
        await capturePostback(sub, rest[0]!, rest[1]!);
        break;
      }
      case "browser-postback": {
        if (!sub || rest.length !== 2) usage();
        await browserPostback(sub, rest[0]!, rest[1]!);
        break;
      }
      case "parse":
        if (!sub || rest.length !== 1) usage();
        await parse(sub, rest[0]!);
        break;
      case "robots":
        if (!sub || rest.length !== 0) usage();
        await robots(sub);
        break;
      case "session":
        if (sub === "init") await sessionInit();
        else if (sub === "check") await sessionCheck(rest[0]);
        else usage();
        break;
      case "search": {
        if (sub !== "teams") usage();
        // Required flags: --year, --section, --division, --gender
        // Optional:       --level, --out-json
        // Required positional: out-html path
        // Values are matched by visible-label text (more stable than
        // composite <option value> tokens), so quote them in the shell.
        const positional: string[] = [];
        let year: number | undefined;
        let section: string | undefined;
        let division: string | undefined;
        let gender: "Male" | "Female" | "Mixed" | undefined;
        let level: string | undefined;
        let outJson: string | undefined;
        let extractFor: string | undefined;
        for (let i = 0; i < rest.length; i++) {
          const arg = rest[i]!;
          const next = () => {
            const n = rest[i + 1];
            if (!n) usage();
            i += 1;
            return n!;
          };
          if (arg === "--year") year = Number(next());
          else if (arg === "--section") section = next();
          else if (arg === "--division") division = next();
          else if (arg === "--gender") {
            const g = next();
            if (g !== "Male" && g !== "Female" && g !== "Mixed") usage();
            gender = g;
          } else if (arg === "--level") level = next();
          else if (arg === "--out-json") outJson = next();
          else if (arg === "--extract-par1-for") extractFor = next();
          else positional.push(arg);
        }
        if (
          positional.length !== 1 ||
          !year ||
          !section ||
          !division ||
          !gender
        ) {
          usage();
        }
        await searchTeamsCmd({
          year: year!,
          section: section!,
          division: division!,
          gender: gender!,
          level,
          outHtml: positional[0]!,
          outJson,
          extractPar1ForTeamSubstring: extractFor,
        });
        break;
      }
      case "ratings": {
        if (sub !== "fit") usage();
        const positional: string[] = [];
        let minMatches = 3;
        let labelsPath: string | undefined;
        let priorFromNtrp = false;
        let model: "glicko" | "perf" = "glicko";
        for (let i = 0; i < rest.length; i++) {
          const arg = rest[i]!;
          if (arg === "--min-matches") {
            const next = rest[i + 1];
            if (!next) usage();
            minMatches = Number(next);
            if (!Number.isFinite(minMatches)) usage();
            i += 1;
          } else if (arg === "--labels") {
            const next = rest[i + 1];
            if (!next) usage();
            labelsPath = next;
            i += 1;
          } else if (arg === "--prior-from-ntrp") {
            priorFromNtrp = true;
          } else if (arg === "--model") {
            const next = rest[i + 1];
            if (next !== "glicko" && next !== "perf") usage();
            model = next;
            i += 1;
          } else {
            positional.push(arg);
          }
        }
        if (positional.length < 1) usage();
        await ratingsFitCmd(positional, {
          minMatches,
          labelsPath,
          priorFromNtrp,
          model,
        });
        break;
      }
      case "tennisrecord": {
        if (sub !== "aggregate") usage();
        const positional: string[] = [];
        let year: number | undefined;
        let outJson: string | undefined;
        let maxPlayers = 999_999;
        let minDelayMs = 2000;
        let maxDelayMs = 4000;
        for (let i = 0; i < rest.length; i++) {
          const arg = rest[i]!;
          const next = () => {
            const n = rest[i + 1];
            if (!n) usage();
            i += 1;
            return n!;
          };
          if (arg === "--year") year = Number(next());
          else if (arg === "--out") outJson = next();
          else if (arg === "--max-players") maxPlayers = Number(next());
          else if (arg === "--min-delay") minDelayMs = Number(next());
          else if (arg === "--max-delay") maxDelayMs = Number(next());
          else positional.push(arg);
        }
        if (
          positional.length < 1 ||
          !year ||
          !outJson ||
          !Number.isFinite(maxPlayers)
        ) {
          usage();
        }
        await tennisrecordAggregateCmd({
          aggregatePaths: positional,
          year: year!,
          outJson: outJson!,
          maxPlayers,
          minDelayMs,
          maxDelayMs,
        });
        break;
      }
      case "crawl": {
        if (sub !== "team" && sub !== "subflight") usage();
        const positional: string[] = [];
        let outDir = "captures";
        let includePlayers = false;
        for (let i = 0; i < rest.length; i++) {
          const arg = rest[i]!;
          if (arg === "--out") {
            const next = rest[i + 1];
            if (!next) usage();
            outDir = next;
            i += 1;
          } else if (arg === "--include-players") {
            includePlayers = true;
          } else {
            positional.push(arg);
          }
        }
        if (positional.length !== 2) usage();
        const year = Number(positional[1]);
        if (!Number.isFinite(year)) usage();
        if (sub === "team") {
          await crawlTeamCmd(positional[0]!, year, { rootDir: outDir });
        } else {
          await crawlSubflightCmd(positional[0]!, year, {
            rootDir: outDir,
            includePlayers,
          });
        }
        break;
      }
      default:
        usage();
    }
  } catch (err) {
    if (err instanceof SessionMissingError) {
      console.error(err.message);
      process.exit(2);
    }
    if (err instanceof LoginRequiredError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

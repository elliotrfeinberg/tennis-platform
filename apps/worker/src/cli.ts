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
  initSessionTemplate,
  loadSession,
  parsePlayerSearch,
  parseRobots,
  teamProfileUrl,
  type UstaSession,
} from "@tennis/scraper";

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
    default:
      console.error(`Unknown parser kind: ${kind}`);
      console.error("Available: search, robots");
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
  opts: { rootDir: string }
) {
  const session = await loadSession();
  const ownProfileUrl = teamProfileUrl({ par1, year });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const stagingKey = `par1-${par1.slice(0, 12)}-subflight`;
  let subflightDir = join(opts.rootDir, "raw", stagingKey, ts);
  await mkdir(subflightDir, { recursive: true });
  console.error(`Subflight crawl: par1=${par1} year=${year}`);
  console.error(`  staging dir: ${subflightDir}`);

  // Phase 1: harvest opponent par1s via browser.
  console.error("Phase 1/2: harvesting opponent par1s via Chromium...");
  const browser = new BrowserFetcher({
    session,
    minDelayMs: 3000,
    maxDelayMs: 5000,
  });
  let harvest;
  try {
    harvest = await extractOpponentPar1s(browser, ownProfileUrl);
  } finally {
    await browser.close();
  }
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
  console.error("Phase 2/2: crawling each team via PoliteFetcher...");
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
    `Subflight crawl complete: ${successCount}/${teamResults.length} teams ok`
  );
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

function usage(): never {
  console.error(`Usage:
  tennis-scrape capture <url> <out-file> [--no-auth]
  tennis-scrape capture-postback <url> <event-target> <out-file>
  tennis-scrape browser-postback <url> <event-target> <out-file>
  tennis-scrape parse <kind> <html-file>     (kind: search|robots)
  tennis-scrape robots <host>
  tennis-scrape session init
  tennis-scrape session check [probe-url]
  tennis-scrape crawl team <par1> <year> [--out <dir>]   (default --out: ./captures)
  tennis-scrape crawl subflight <par1> <year> [--out <dir>]

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
      case "crawl": {
        if (sub !== "team" && sub !== "subflight") usage();
        const positional: string[] = [];
        let outDir = "captures";
        for (let i = 0; i < rest.length; i++) {
          const arg = rest[i]!;
          if (arg === "--out") {
            const next = rest[i + 1];
            if (!next) usage();
            outDir = next;
            i += 1;
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
          await crawlSubflightCmd(positional[0]!, year, { rootDir: outDir });
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

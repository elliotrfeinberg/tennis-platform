// Parser for the StatsAndStandings.aspx?t=3 team profile page.
//
// One page contains four datasets the optimizer needs:
//
//   1. Team metadata     — name, section, district, league, flight, captain,
//                          season dates, year.
//   2. Flight standings  — every team in the flight with W/L / games / points.
//                          Team links are __doPostBack only (no par1 visible),
//                          so we can extract names but not direct URLs.
//   3. Match schedule    — every scheduled team-match (played + upcoming),
//                          with opponent name, date, summary result, and a
//                          numeric match id we *can* turn into a scorecard
//                          URL (StatsAndStandings.aspx?t=7&par1=<matchId>).
//   4. Roster            — players on this team with NTRP level.
//
// Selectors are anchored to the rendered ASP.NET ids / class names from the
// real captured page (see src/__fixtures__/team-profile.html). If USTA
// reskins the page the parser breaks loudly with empty arrays — the test
// against the fixture will catch that in CI.

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export interface TeamProfileHeader {
  teamName: string;
  section: string | undefined;
  district: string | undefined;
  league: string | undefined;
  flight: string | undefined;
  subFlight: string | undefined;
  captain: string | undefined;
  facility: string | undefined;
  leagueDates: string | undefined;
  year: number | undefined;
  shareUrl: string | undefined;
}

export interface StandingsRow {
  teamName: string;
  wins: number;
  matchesPlayed: number;
  gamesWon: number;
  points: number;
  losses: number;
  individualWins: number;
  individualLosses: number;
  setsWon: number;
  setsLost: number;
  gamesLost: number;
  gamesWonPct: number | undefined;
  // DOM id of the team-name anchor — needed for clickPostback-based
  // opponent par1 harvesting since USTA renders the link as a JS
  // __doPostBack with no par1 in the href.
  linkButtonId: string | undefined;
}

export interface ScheduleRow {
  date: string; // raw "4/12/2026"
  opponentName: string;
  matchId: string | undefined; // numeric id for scorecardUrl; undefined when not yet linked
  // Visible result blob, e.g. "Won 4-1", "Not Played". Pre-match it's empty.
  result: string | undefined;
  // Confirmation note like "Confirmed by Lisa Italia (V)". Optional.
  confirmation: string | undefined;
  // True if the page renders this match with a confirmed status.
  played: boolean;
}

export interface RosterEntry {
  name: string;
  ntrp: number | undefined;
}

export interface ParsedTeamProfile {
  header: TeamProfileHeader;
  standings: StandingsRow[];
  schedule: ScheduleRow[];
  roster: RosterEntry[];
}

export function parseTeamProfile(html: string): ParsedTeamProfile {
  const $ = cheerio.load(html);
  return {
    header: parseHeader($, html),
    standings: parseStandings($),
    schedule: parseSchedule($),
    roster: parseRoster($),
  };
}

// ---- header ----

function parseHeader($: CheerioAPI, rawHtml: string): TeamProfileHeader {
  const teamName = $("h1")
    .filter((_, el) => /^\s*Team:/.test($(el).text()))
    .first()
    .text()
    .replace(/^\s*Team:\s*/, "")
    .trim();

  // tblTeamAnchor alternates between subhead-only rows and value-only rows.
  // Pair each subhead row with the next sibling row that has matching cells.
  const fields: Record<string, string> = {};
  const $rows = $("#ctl00_mainContent_tblTeamAnchor > tbody > tr, #ctl00_mainContent_tblTeamAnchor > tr");
  $rows.each((idx, tr) => {
    const $tr = $(tr);
    const $subheads = $tr.children("td.subhead");
    if (!$subheads.length) return;
    const $next = $rows.eq(idx + 1);
    const $values = $next.children("td.top");
    if (!$values.length) return;
    $subheads.each((i, sh) => {
      const label = $(sh).text().replace(/\s+/g, " ").trim();
      const val = $values
        .eq(i)
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (label && val) fields[label] = val;
    });
  });

  const yearHidden = $("#ctl00_mainContent_hdnCyear").attr("value");
  const year = yearHidden ? Number(yearHidden) : undefined;

  // The page's own share/canonical URL is rendered into the copy-link
  // helper, Facebook button, Twitter button, etc. — all with explicit
  // ":443" port. When the page is reached via postback navigation, an
  // earlier reference to the *originating* page's URL (no port) appears
  // first in the HTML — we must skip that and pick a canonical (:443)
  // match so the par1 matches the rendered team, not the referrer.
  //
  // Match against the raw HTML, not cheerio's serialized version (which
  // can re-encode the ampersands).
  const shareUrlRe =
    /https?:\/\/tennislink\.usta\.com(?::\d+)?\/Leagues\/Main\/StatsAndStandings\.aspx\?t=3&(?:amp;)?par1=[A-F0-9]+&(?:amp;)?par2=\d{4}&(?:amp;)?par3=\d+/g;
  const allShareMatches = rawHtml.match(shareUrlRe) ?? [];
  const canonical = allShareMatches.find((u) => u.includes(":443"));
  const shareUrl = canonical ?? allShareMatches[0];

  return {
    teamName,
    section: fields["Section"],
    district: fields["District/Area"],
    league: fields["League"],
    flight: fields["Flight/SubFlight"]?.split("/")[0]?.trim(),
    subFlight: extractSubFlight(fields["Flight/SubFlight"]),
    captain: fields["Captain"],
    facility: fields["Facility"] || undefined,
    leagueDates: fields["League Date"]?.replace(/\s+Flight Date.*$/, "").trim(),
    year,
    shareUrl,
  };
}

function extractSubFlight(combined: string | undefined): string | undefined {
  if (!combined) return undefined;
  const slash = combined.indexOf("/");
  if (slash < 0) return undefined;
  return combined.slice(slash + 1).trim() || undefined;
}

// ---- standings ----

function parseStandings($: CheerioAPI): StandingsRow[] {
  // The standings table id is "TeamSummary" (yes, confusing — the schedule
  // is "TeamSummaryTeamStandings"). Rows have 12 cells in the static
  // server-rendered HTML, but USTA's client-side JS injects two extra
  // GamesWin display-cells in a live browser context — bringing the count
  // to 14. The first 10 positions are stable in both layouts; the last
  // two (games-lost + games-won %) sit at the tail regardless.
  const rows: StandingsRow[] = [];
  $("#TeamSummary tr").each((_, tr) => {
    const $tr = $(tr);
    // Skip header / footer rows.
    if ($tr.find("td.subhead").length) return;
    if ($tr.find("td.bottomLine").length) return;
    const $cells = $tr.children("td");
    if ($cells.length < 12) return;
    const anchor = $cells.eq(0).find("a");
    const teamName = anchor.length
      ? anchor.text().replace(/\s+/g, " ").trim()
      : $cells.eq(0).text().replace(/\s+/g, " ").trim();
    if (!teamName) return;
    const linkButtonId = anchor.attr("id");
    const cellAsNumber = (i: number): number =>
      Number($cells.eq(i).text().trim().replace(/,/g, "")) || 0;
    const n = $cells.length;
    const pctText = $cells.eq(n - 1).text().trim();
    const pctMatch = pctText.match(/([\d.]+)%/);
    rows.push({
      teamName,
      wins: cellAsNumber(1),
      matchesPlayed: cellAsNumber(2),
      gamesWon: cellAsNumber(3),
      points: cellAsNumber(4),
      losses: cellAsNumber(5),
      individualWins: cellAsNumber(6),
      individualLosses: cellAsNumber(7),
      setsWon: cellAsNumber(8),
      setsLost: cellAsNumber(9),
      gamesLost: cellAsNumber(n - 2),
      gamesWonPct: pctMatch ? Number(pctMatch[1]) : undefined,
      linkButtonId,
    });
  });
  return rows;
}

// ---- schedule ----

function parseSchedule($: CheerioAPI): ScheduleRow[] {
  // The Team Matches table is rendered into #TeamSummaryTeamStandings with
  // two date+opponent+result groups per <tr> for layout. Within each group:
  //   - .top.blue with a hastooltip div: clickable date + a tooltiptext
  //     <table> that has Date, Team, Opponent, Action (with ViewScore JS).
  //   - .top : opponent team name anchor
  //   - .top : result spans ("display:none" hidden conf note + visible
  //     "Won X-Y" or "Not Played" block).
  const out: ScheduleRow[] = [];
  $("#TeamSummaryTeamStandings tr").each((_, tr) => {
    const $tr = $(tr);
    // Skip header row (has .subhead cells)
    if ($tr.find("td.subhead").length) return;
    const cells = $tr.children("td").toArray();
    // Walk cells in groups of 4: [dateBlue, spacer15, opponent, result]
    for (let i = 0; i + 3 < cells.length; i += 4) {
      const $dateCell = $(cells[i]!);
      // Only treat as a match group if there's a tooltip table inside.
      const $tooltip = $dateCell.find(".tooltiptext table");
      if (!$tooltip.length) continue;
      const tooltipFields = extractTooltipFields($, $tooltip);
      const date = tooltipFields["Date"] ?? $dateCell.find("a").first().text().trim();
      const opponent = tooltipFields["Opponent"] ?? "";
      const action = tooltipFields["Action"] ?? "";
      const matchId = (action.match(/ViewScore\((\d+)/) ?? [])[1];

      const $resultCell = $(cells[i + 3]!);
      const $visibleSpans = $resultCell.find("span").filter((_, el) => {
        const style = $(el).attr("style") ?? "";
        return /display\s*:\s*block/i.test(style);
      });
      const $hiddenSpans = $resultCell.find("span").filter((_, el) => {
        const style = $(el).attr("style") ?? "";
        return /display\s*:\s*none/i.test(style);
      });
      const resultText = $visibleSpans.text().replace(/\s+/g, " ").trim() || undefined;
      const confirmation =
        $hiddenSpans.text().replace(/\s+/g, " ").trim() || undefined;

      out.push({
        date,
        opponentName: opponent.replace(/\s+/g, " ").trim(),
        matchId,
        result: resultText,
        confirmation,
        played: /^Won|^Lost|^Tie/i.test(resultText ?? ""),
      });
    }
  });
  return out;
}

function extractTooltipFields(
  $: CheerioAPI,
  $tooltip: cheerio.Cheerio<any>
): Record<string, string> {
  const fields: Record<string, string> = {};
  $tooltip.find("tr").each((_, row) => {
    const $tds = $(row).find("td");
    if ($tds.length < 2) return;
    const label = $tds.eq(0).text().trim().replace(/:$/, "");
    // The Action cell has nested elements (link + div); grab raw HTML to
    // preserve the ViewScore(...) onclick for matchId extraction.
    if (label === "Action") {
      fields[label] = $tds.eq(1).html() ?? "";
    } else {
      fields[label] = $tds.eq(1).text().replace(/\s+/g, " ").trim();
    }
  });
  return fields;
}

// ---- roster ----

function parseRoster($: CheerioAPI): RosterEntry[] {
  // The roster is rendered into a CommonTable Segmented "last" table with
  // 3-column layout. Each row has up to 3 (Name, NTRP) pairs. We pick the
  // table by walking up from the "tblTeamsummaryForPlayers" heading anchor.
  const $header = $("#ctl00_mainContent_tblTeamsummaryForPlayers");
  if (!$header.length) return [];
  // The data table is the next .CommonTable.Segmented.last in document order.
  const $data = $header
    .closest(".wide-scrollx-wrapper, .panes, body")
    .find(".CommonTable.Segmented.last")
    .filter((_, t) => $(t).find("td.subhead:contains('Player Name')").length > 0)
    .first();
  if (!$data.length) return [];

  const entries: RosterEntry[] = [];
  $data.find("tr").each((_, tr) => {
    const $cells = $(tr).children("td");
    if ($cells.length < 2) return;
    // Skip header row
    if ($cells.first().is("td.subhead")) return;
    // Cells come in (Name, NTRP) pairs; some pairs may be empty padding.
    for (let i = 0; i + 1 < $cells.length; i += 2) {
      const name = $cells
        .eq(i)
        .find("a")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (!name) continue;
      const ntrpText = $cells.eq(i + 1).text().trim();
      const ntrp = ntrpText ? Number(ntrpText) : undefined;
      entries.push({
        name,
        ntrp: ntrp !== undefined && Number.isFinite(ntrp) ? ntrp : undefined,
      });
    }
  });
  return entries;
}

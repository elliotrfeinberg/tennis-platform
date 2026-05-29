// Parser for the t=T-0 "Individual Player Record" page (StatsAndStandings
// SPA). This is the landing for a player's rating-search par1 token. It lists
// every team the member is registered on, grouped by year, with the team's
// section / district / league / flight. Each team name is a __doPostBack
// anchor — clicking it loads that team's flight context, the entry point to
// the flight-level Match Summary (the whole point of flight enumeration).
//
// Table shape (one block per year):
//
//   <a ...LinkButton22>2026 Individual Player Record</a>
//   | Team | Section | District | League | Flight |          (header row)
//   | <a ...rptPlayerName_ctl00_LinkButton4>OAKLAND HILLS 40AM3.5A</a>
//   | USTA/NO. CALIFORNIA | NO. CALIFORNIA | 2026 ADULT 40&Over | Men's 3.5 |
//
// We key each team row off its anchor (id contains "rptPlayerName" and ends
// "LinkButton4"); the year is the 4-digit prefix of the League cell ("2026
// ADULT …"), which is more reliable than walking back to the block header.

import * as cheerio from "cheerio";

export interface PlayerRecordTeam {
  year: number | undefined;
  teamName: string;
  section: string | undefined;
  district: string | undefined;
  league: string | undefined; // "2026 ADULT 40&Over"
  flight: string | undefined; // "Men's 3.5"
  // The anchor's element id (underscore form) — click this to reach the team.
  teamAnchorId: string;
}

export interface ParsedPlayerRecord {
  playerName: string | undefined;
  teams: PlayerRecordTeam[];
}

const YEAR_RE = /\b(19|20)\d{2}\b/;

export function parsePlayerRecord(html: string): ParsedPlayerRecord {
  const $ = cheerio.load(html);

  let playerName: string | undefined;
  const titleEl = $("#ctl00_mainContent_hResultTitle");
  if (titleEl.length) {
    const t = titleEl.text().replace(/\s+/g, " ").trim();
    if (t) playerName = t;
  }

  const teams: PlayerRecordTeam[] = [];
  const seenAnchors = new Set<string>();

  $("a").each((_, a) => {
    const id = $(a).attr("id") ?? "";
    if (!/rptPlayerName/.test(id) || !/LinkButton4$/.test(id)) return;
    if (seenAnchors.has(id)) return;
    seenAnchors.add(id);

    const teamName = $(a).text().replace(/\s+/g, " ").trim();
    if (!teamName) return;

    // The enclosing row's cells: [Team, Section, District, League, Flight].
    const $row = $(a).closest("tr");
    const cells = $row
      .children("td")
      .map((_i, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();
    const section = cells[1] || undefined;
    const district = cells[2] || undefined;
    const league = cells[3] || undefined;
    const flight = cells[4] || undefined;
    const yearStr = league ? (league.match(YEAR_RE) ?? [])[0] : undefined;

    teams.push({
      year: yearStr ? Number(yearStr) : undefined,
      teamName,
      section,
      district,
      league,
      flight,
      teamAnchorId: id,
    });
  });

  return { playerName, teams };
}

// The base team code without the trailing per-cluster letter, e.g.
// "OAKLAND HILLS 40AM3.5A" -> "40AM3.5". Used to label a flight compactly.
// Returns undefined when no recognizable code is present.
export function flightCodeFromTeamName(teamName: string): string | undefined {
  // Code = <agegroup 2 digits><A/etc + gender letter(s)><level d.d><letter>.
  // We match the canonical "##XX#.#" stem and drop the final letter.
  const m = teamName.match(/\b(\d{2}[A-Z]{2}\d\.\d)[A-Z]?\b/);
  return m ? m[1] : undefined;
}

// Stable dedupe key for a flight: "{year}|{league}|{flightName}".
export function flightKeyOf(
  year: number | undefined,
  league: string | undefined,
  flightName: string | undefined
): string {
  return `${year ?? "?"}|${league ?? "?"}|${flightName ?? "?"}`;
}

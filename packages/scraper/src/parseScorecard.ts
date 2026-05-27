// Parser for the StatsAndStandings.aspx?t=7 match scorecard page.
//
// Each scorecard page describes one team-match (home vs visitor) with one
// row per court played. The parser is format-agnostic — it walks whatever
// court rows the page actually contains. League formats vary:
//
//   - Adult 18+/40+/55+ singles+doubles : 2S + 3D = 5 courts
//   - Mixed doubles                     : 5D       = 5 courts
//   - Combo                             : 3D       = 3 courts
//   - Tri-Level                         : 3 lines (1S + 2D)
//   - 65+ / 70+ / some local            : 1S + 2D  = 3 courts
//
// `line` and `kind` are extracted per-court from each row's "N# Singles" /
// "N# Doubles" label, so the format breakdown falls out automatically.
//
// HTML quirks worth knowing:
//
// - The scorecard is *not* one big <table>: each court row is wrapped in
//   its own <table class="CommonTable Segmented"> with id-less <tr>. The
//   only stable way to find courts is via the player-link ids:
//     ctl00_mainContent_rptScoreCard_ctl<NN>_lnkHomePlayer1
//   Walking up from those gives us the court row.
//
// - Court winner is encoded only by the presence of a "mark.gif" check
//   image in the home-side or visitor-side spacer cell. No text label.
//
// - Player2 anchors exist for both singles and doubles courts but are
//   empty for singles; we collapse empty names away.
//
// - Set scores live in the rightmost cell as space-prefixed "X-Y<BR>X-Y[..]"
//   text. The column header in the page says "3rd Set Tie-break" but the
//   cell actually holds *all* set scores stacked vertically — that label is
//   USTA's misleading legacy markup. We parse every X-Y in the cell.

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export interface ScorecardSet {
  home: number;
  visitor: number;
}

export interface ScorecardHeader {
  matchNumber: string;
  league: string | undefined;
  status: string | undefined; // "Confirmed by NAME (V)", "Pending", etc.
  homeTeamName: string;
  visitorTeamName: string;
  dateScheduled: string | undefined; // "5/11/2026 6:30 PM"
  datePlayed: string | undefined; // "5/11/2026"
  entryDate: string | undefined; // "5/25/2026"
}

export interface ScorecardCourt {
  // 1, 2, 3, ... within the court kind (1# Singles, 2# Singles, 1# Doubles, ...)
  line: number;
  kind: "S" | "D";
  // The verbatim label from the page, e.g. "1# Doubles"
  rawLabel: string;
  startTime: string | undefined; // "6:30 PM"
  homePlayers: string[];
  visitorPlayers: string[];
  sets: ScorecardSet[];
  // Inferred from mark.gif presence; undefined if neither side has one
  // (e.g. default/forfeit cases we haven't seen yet).
  homeWon: boolean | undefined;
  // True if the court row says "Completed".
  completed: boolean;
  // Which side retired mid-match, if any. USTA renders "Retired" inside
  // that side's player cell. The mark.gif still flags the winner.
  retired: "home" | "visitor" | undefined;
  // Which side defaulted (forfeit without playing). USTA renders "Default"
  // or "Defaulted" inside that side's player cell.
  defaulted: "home" | "visitor" | undefined;
}

export interface ParsedScorecard {
  header: ScorecardHeader;
  courts: ScorecardCourt[];
}

export function parseScorecard(html: string): ParsedScorecard {
  const $ = cheerio.load(html);
  return {
    header: parseScorecardHeader($, html),
    courts: parseCourts($),
  };
}

// ---- header ----

function parseScorecardHeader(
  $: CheerioAPI,
  rawHtml: string
): ScorecardHeader {
  // The match number appears in the centered header text:
  //   "Scorecard for Match # 1011875481 in 2026 ADULT 18&Over"
  // The same line carries league and status text.
  const headerText = $("#ctl00_mainContent_tblScoreCardHeader1")
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const matchNumber =
    (headerText.match(/Match\s*#\s*(\d+)/) ?? [])[1] ?? "";
  // USTA's rendering of the header (after cheerio text-collapse) often has
  // no whitespace between the league text and "Status:" — the surrounding
  // </strong></font><br><br><strong> tags collapse to zero characters.
  // Allow zero or more whitespace before Status. The trailing "*" form is
  // a footnote-only variant when there's no Status line at all.
  const league =
    (headerText.match(/in\s+(.+?)\s*Status/i) ?? [])[1] ??
    (headerText.match(/in\s+(.+?)\s*\*/) ?? [])[1];
  const status =
    (headerText.match(/Status:\s*(.+?)\s*(Today's Date|\*|$)/) ?? [])[1];

  const homeTeamName =
    $("#ctl00_mainContent_lnkHomeTeamForScoreCard")
      .text()
      .replace(/\s+/g, " ")
      .trim();
  const visitorTeamName =
    $("#ctl00_mainContent_lnkVisitorTeamForScoreCard")
      .text()
      .replace(/\s+/g, " ")
      .trim();

  // Three dates live in #tblScoreCardHeader2 cells as
  //   "Date Scheduled: <b>5/11/2026 6:30 PM</b>"
  // After cheerio's .text() collapse we end up with all three on one line:
  //   "Date Scheduled: 5/11/2026 6:30 PM Date Match Played: 5/11/2026 ..."
  // Boundary between values is "Date Match Played:" / "Entry Date:" — those
  // labels become the lookahead anchors.
  const datesText = $("#ctl00_mainContent_tblScoreCardHeader2")
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const grab = (label: string): string | undefined => {
    const re = new RegExp(
      `${label}:\\s*(.+?)(?=\\s*(?:Date\\s+Scheduled|Date\\s+Match\\s+Played|Entry\\s+Date|Match\\s+Win\\s+Criteria|$))`
    );
    return (datesText.match(re) ?? [])[1]?.trim();
  };

  return {
    matchNumber,
    league: league?.trim(),
    status: status?.trim(),
    homeTeamName,
    visitorTeamName,
    dateScheduled: grab("Date Scheduled"),
    datePlayed: grab("Date Match Played"),
    entryDate: grab("Entry Date"),
  };
}

// ---- courts ----

function parseCourts($: CheerioAPI): ScorecardCourt[] {
  // Find each court via its home-player-1 anchor, then walk up to the row.
  const anchors = $('a[id^="ctl00_mainContent_rptScoreCard_ctl"][id$="_lnkHomePlayer1"]');
  const courts: ScorecardCourt[] = [];

  anchors.each((_, el) => {
    const $a = $(el);
    const idMatch = ($a.attr("id") ?? "").match(/rptScoreCard_ctl(\d+)/);
    if (!idMatch) return;
    const ctlIndex = idMatch[1]!;

    const $row = $a.closest("tr");
    if (!$row.length) return;
    const cells = $row.children("td").toArray();
    if (cells.length < 7) return;

    const $courtLabelCell = $(cells[0]!);
    const $homeCell = $(cells[1]!);
    const $homeSpacer = $(cells[2]!);
    // cells[3] is "Vs."
    const $visitorCell = $(cells[4]!);
    const $visitorSpacer = $(cells[5]!);
    const $scoresCell = $(cells[6]!);

    const labelText = $courtLabelCell.text().replace(/\s+/g, " ").trim();
    // "1# Doubles 6:30 PM" -> line=1, kind=D, time="6:30 PM"
    const labelMatch = labelText.match(/(\d+)\s*#\s*(Singles|Doubles)\s*(.*)?/i);
    if (!labelMatch) return;
    const line = Number(labelMatch[1]);
    const kind = labelMatch[2]!.toLowerCase().startsWith("d") ? "D" : "S";
    const startTime = labelMatch[3]?.trim() || undefined;

    const homePlayers = playersIn($homeCell, ctlIndex, "Home", $);
    const visitorPlayers = playersIn($visitorCell, ctlIndex, "Visitor", $);
    const sets = parseSetScores($scoresCell.html() ?? "");
    const completed = /\bCompleted\b/i.test($homeCell.text());

    // "Retired" / "Default" / "Defaulted" appear as bare text inside the
    // side's player cell. We don't constrain to a specific element since
    // USTA's markup wraps it inconsistently (sometimes a <span>, sometimes
    // just text after a <br>).
    const homeText = $homeCell.text();
    const visitorText = $visitorCell.text();
    const retired = /\bRetired\b/i.test(homeText)
      ? "home"
      : /\bRetired\b/i.test(visitorText)
      ? "visitor"
      : undefined;
    const defaulted = /\bDefault(?:ed)?\b/i.test(homeText)
      ? "home"
      : /\bDefault(?:ed)?\b/i.test(visitorText)
      ? "visitor"
      : undefined;

    const homeHasMark = $homeSpacer.find("img[id$='_imgHomePlayer']").length > 0;
    const visitorHasMark =
      $visitorSpacer.find("img[id$='_imgVisitorPlayer']").length > 0;
    let homeWon: boolean | undefined;
    if (homeHasMark && !visitorHasMark) homeWon = true;
    else if (visitorHasMark && !homeHasMark) homeWon = false;

    courts.push({
      line,
      kind,
      rawLabel: labelText,
      startTime,
      homePlayers,
      visitorPlayers,
      sets,
      homeWon,
      completed,
      retired,
      defaulted,
    });
  });

  return courts;
}

function playersIn(
  $cell: cheerio.Cheerio<any>,
  ctlIndex: string,
  side: "Home" | "Visitor",
  $: CheerioAPI
): string[] {
  const out: string[] = [];
  for (const n of [1, 2]) {
    const id = `ctl00_mainContent_rptScoreCard_ctl${ctlIndex}_lnk${side}Player${n}`;
    const name = $cell
      .find(`#${id}`)
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (name) out.push(name);
  }
  return out;
}

function parseSetScores(cellHtml: string): ScorecardSet[] {
  // The cell looks like: " 6-2<BR> 6-0" (or with extra whitespace and BR
  // variants). Split on any <br>, then pull X-Y from each chunk.
  const sets: ScorecardSet[] = [];
  const chunks = cellHtml.split(/<br\s*\/?>/i);
  for (const chunk of chunks) {
    const text = chunk
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
    const m = text.match(/(\d+)\s*-\s*(\d+)/);
    if (!m) continue;
    sets.push({ home: Number(m[1]), visitor: Number(m[2]) });
  }
  return sets;
}

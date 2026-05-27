// Parser for the StatsAndStandings.aspx?t=8 individual player record.
//
// One page lists every match a player played in a given year, grouped
// by team-context (outer repeater = one block per team they played
// for; inner repeater = the actual courts played within that team's
// season). Reaches us via a roster __doPostBack from a team profile.
//
// Useful properties of this page:
//
// - Per-court rows are dense and structured: matchId, date, winners,
//   losers, score, "#N Singles|Doubles", NTRP level.
// - Multi-team-context: a 3.5 player who also plays 4.0 / 18+ / 40+ /
//   Mixed gets every league context surfaced in one fetch.
// - matchId is a direct link to the scorecard (no postback needed) so
//   we can cross-reference with our team_match crawl outputs.
//
// HTML quirks worth knowing:
//
// - The outer repeater id is `rptLeagueResultsForIndividual_ctlNN`;
//   the inner is `rptLeagueResutlsDetailForIndividual_ctlMM` (note
//   the typo "Resutls" in USTA's developer's id — we anchor to that
//   exact misspelling because it's stable in USTA's markup).
// - The winners / losers cells each contain a small inner <table>
//   with one <tr> per player on that side. Player names sit in tds
//   with ids matching `tdIndvWinner{N}Name` / `tdIndvLoser{N}Name`.
// - The canonical share URL at the top of the page carries the
//   player's own par1 with explicit `:443` (same pattern as the
//   postback team-profile destination).

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export interface PlayerProfileHeader {
  // Display name from the top-of-page profile block.
  name: string;
  // "City, ST" if rendered; undefined otherwise.
  location: string | undefined;
  // The year the page covers (par2 in the URL, also in the H1).
  year: number | undefined;
  // The canonical t=8&par1=... share URL — par1 is the player's hex
  // token. Use this to re-fetch the page directly via PoliteFetcher.
  shareUrl: string | undefined;
  // Extracted from shareUrl for convenience.
  playerPar1: string | undefined;
}

export interface PlayerMatchRow {
  // Group index — same matchId can theoretically appear across team
  // contexts if a player gets traded mid-season; the contextIndex lets
  // callers reconstruct which inner repeater (and therefore which team
  // context) this row came from.
  contextIndex: number;
  matchId: string;
  date: string; // raw "4/28/2026"
  winners: string[];
  losers: string[];
  // Raw score string, e.g. "6-2, 7-5" or "6-4 retired".
  score: string;
  // Court label as rendered, e.g. "#1 Singles", "#2 Doubles".
  courtLabel: string;
  // Parsed line + kind from courtLabel.
  line: number | undefined;
  kind: "S" | "D" | undefined;
  // NTRP level cell as rendered, e.g. "3.5".
  ntrp: number | undefined;
  // Convenience: was the page's subject player on the winning side?
  // Undefined if the subject's name doesn't appear on either side
  // (shouldn't happen on a real player page; defensive against drift).
  subjectWon: boolean | undefined;
}

export interface ParsedPlayerProfile {
  header: PlayerProfileHeader;
  matches: PlayerMatchRow[];
}

export function parsePlayerProfile(html: string): ParsedPlayerProfile {
  const $ = cheerio.load(html);
  const header = parseHeader($, html);
  const matches = parseMatches($, header.name);
  return { header, matches };
}

// ---- header ----

function parseHeader($: CheerioAPI, rawHtml: string): PlayerProfileHeader {
  // H1 reads "TennisLink League Reports - Individual Player Record for 2026"
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const yearMatch = h1.match(/(\d{4})/);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;

  // The player's name + location sit in two consecutive <strong> blocks
  // at the top of the report body. We don't anchor to a specific
  // container because the surrounding markup varies; instead pull
  // strongs that look like (a) a person name and (b) "City, ST".
  const strongs = $("strong")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .toArray()
    .filter((s) => s.length > 0);
  const name =
    strongs.find((s) =>
      /^[A-Z][a-z'-]+(?:\s+[A-Z][a-zA-Z'.\-]+){1,3}$/.test(s)
    ) ?? "";
  const location = strongs.find((s) =>
    /^[A-Z][a-zA-Z .'-]+,\s*[A-Z]{2,}$/.test(s)
  );

  // The "Link to this Page" anchor carries the canonical share URL with
  // the player's own par1. Prefer the version with explicit `:443` if
  // present (matches the postback-destination team-profile convention).
  const shareUrlRe =
    /https?:\/\/tennislink\.usta\.com(?::\d+)?\/Leagues\/Main\/StatsAndStandings\.aspx\?t=8&(?:amp;)?par1=[A-F0-9]+&(?:amp;)?par2=\d{4}&(?:amp;)?par3=\d+/g;
  const allMatches = rawHtml.match(shareUrlRe) ?? [];
  let shareUrl: string | undefined =
    allMatches.find((u) => u.includes(":443")) ?? allMatches[0];

  // Also accept the relative form rendered into the lnkShare anchor
  // (e.g. `StatsAndStandings.aspx?t=8&amp;par1=DB...&amp;par2=2026&amp;par3=0`).
  // We prefer the absolute form when both exist; this is the fallback.
  if (!shareUrl) {
    const relMatch = rawHtml.match(
      /StatsAndStandings\.aspx\?t=8&(?:amp;)?par1=[A-F0-9]+&(?:amp;)?par2=\d{4}&(?:amp;)?par3=\d+/
    );
    shareUrl = relMatch ? relMatch[0] : undefined;
  }
  const par1Match = shareUrl?.match(/par1=([A-F0-9]+)/);
  const playerPar1 = par1Match ? par1Match[1] : undefined;

  return { name, location, year, shareUrl, playerPar1 };
}

// ---- match rows ----

function parseMatches($: CheerioAPI, subjectName: string): PlayerMatchRow[] {
  const rows: PlayerMatchRow[] = [];
  // Anchor against USTA's "Resutls" typo — it's stable in the markup
  // and the correctly-spelled "Results" would silently mis-match.
  $('a[id*="_rptLeagueResutlsDetailForIndividual_ctl"][id$="_LinkButton23"]').each(
    (_, a) => {
      const $matchAnchor = $(a);
      const id = $matchAnchor.attr("id") ?? "";
      // Outer ctl index lives between "ForIndividual_ctl" and "_rptLeague…"
      const outerMatch = id.match(/ForIndividual_ctl(\d+)_/);
      const contextIndex = outerMatch ? Number(outerMatch[1]) : 0;
      const matchId = $matchAnchor.text().trim();
      if (!/^\d+$/.test(matchId)) return;

      const $row = $matchAnchor.closest("tr");
      if (!$row.length) return;
      const $cells = $row.children("td");
      // Expected layout: matchId | date | winners | losers | score |
      // court | ntrp.
      if ($cells.length < 7) return;

      const date = $cells.eq(1).text().replace(/\s+/g, " ").trim();
      const winners = extractSidePlayers($, $cells.eq(2), "Winner");
      const losers = extractSidePlayers($, $cells.eq(3), "Loser");
      const score = $cells.eq(4).text().replace(/\s+/g, " ").trim();
      const courtLabel = $cells.eq(5).text().replace(/\s+/g, " ").trim();
      const ntrpText = $cells.eq(6).text().trim();
      const ntrp =
        ntrpText && /^[\d.]+$/.test(ntrpText) ? Number(ntrpText) : undefined;

      const labelMatch = courtLabel.match(/#?(\d+)\s*(Singles|Doubles)/i);
      const line = labelMatch ? Number(labelMatch[1]) : undefined;
      const kind: "S" | "D" | undefined = labelMatch
        ? labelMatch[2]!.toLowerCase().startsWith("d")
          ? "D"
          : "S"
        : undefined;

      // Subject-side detection: USTA pads names with non-breaking
      // spaces. Normalize before compare.
      const subj = normalizeName(subjectName);
      const onWinners = winners.some((n) => normalizeName(n) === subj);
      const onLosers = losers.some((n) => normalizeName(n) === subj);
      const subjectWon =
        onWinners && !onLosers
          ? true
          : onLosers && !onWinners
          ? false
          : undefined;

      rows.push({
        contextIndex,
        matchId,
        date,
        winners,
        losers,
        score,
        courtLabel,
        line,
        kind,
        ntrp,
        subjectWon,
      });
    }
  );
  return rows;
}

// Pull 1-2 player names from a winners/losers cell. The cell holds an
// inner <table> with one row per player on that side; player names sit
// in tds whose id ends "tdIndv{side}{N}Name". Singles courts render
// only "Name1"; doubles render "Name1" + "Name2". Empty cells filtered.
function extractSidePlayers(
  $: CheerioAPI,
  $cell: cheerio.Cheerio<any>,
  side: "Winner" | "Loser"
): string[] {
  const names: string[] = [];
  $cell.find(`td[id*="tdIndv${side}"][id$="Name"]`).each((_, td) => {
    const name = normalizeName($(td).text());
    if (name) names.push(name);
  });
  return names;
}

function normalizeName(s: string): string {
  // Replace U+00A0 (the &nbsp; that USTA pads names with) with regular
  // space, then collapse all runs of whitespace.
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

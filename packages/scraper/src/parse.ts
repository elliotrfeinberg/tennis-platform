// HTML parsers for tennislink pages.
//
// Each parser takes HTML text and returns a typed structured result. They
// are pure functions — no I/O — so they're easy to test against captured
// HTML fixtures. We capture and commit fixtures alongside the tests so a
// tennislink layout change is caught by CI before it breaks the crawler.
//
// IMPORTANT: the selectors below are placeholders structured around the
// shape of tennislink's pages from public references. Real selectors will
// be verified during the first crawl and the fixtures added to
// src/__fixtures__/ so this file becomes test-driven.

import * as cheerio from "cheerio";

export interface PlayerSearchResultRow {
  tennislinkId: string;
  displayName: string;
  section: string | undefined;
  state: string | undefined;
  publishedNtrp: number | undefined;
  gender: "M" | "F" | undefined;
}

export interface ParsedMatch {
  playedOn: string; // ISO date
  line: number | undefined;
  courtKind: "S" | "D";
  homePlayers: string[]; // tennislinkIds
  awayPlayers: string[];
  sets: { home: number; away: number }[];
  homeWon: boolean;
}

export interface ParsedPlayerHistory {
  tennislinkId: string;
  displayName: string;
  matches: ParsedMatch[];
}

// Player search result rows from /leagues/reports/NTRP/AdvancedSearch.aspx.
export function parsePlayerSearch(html: string): PlayerSearchResultRow[] {
  const $ = cheerio.load(html);
  const rows: PlayerSearchResultRow[] = [];
  $("table.results tr[data-player-id]").each((_, el) => {
    const $row = $(el);
    const id = $row.attr("data-player-id");
    if (!id) return;
    const name = $row.find(".name").text().trim();
    const section = $row.find(".section").text().trim() || undefined;
    const state = $row.find(".state").text().trim() || undefined;
    const ntrpText = $row.find(".ntrp").text().trim();
    const ntrp = ntrpText ? Number(ntrpText) : undefined;
    const genderText = $row.find(".gender").text().trim();
    const gender =
      genderText === "M" ? "M" : genderText === "F" ? "F" : undefined;
    rows.push({
      tennislinkId: id,
      displayName: name,
      section,
      state,
      publishedNtrp: Number.isFinite(ntrp) ? ntrp : undefined,
      gender,
    });
  });
  return rows;
}

// Player history page: career match list.
export function parsePlayerHistory(
  html: string,
  tennislinkId: string
): ParsedPlayerHistory {
  const $ = cheerio.load(html);
  const displayName = $(".player-header .name").text().trim();
  const matches: ParsedMatch[] = [];
  $("table.matches tr.match").each((_, el) => {
    const $row = $(el);
    const date = $row.attr("data-date");
    if (!date) return;
    const kind = ($row.attr("data-kind") ?? "S") as "S" | "D";
    const line = Number($row.attr("data-line")) || undefined;
    const homePlayers = ($row.attr("data-home-players") ?? "").split(",").filter(Boolean);
    const awayPlayers = ($row.attr("data-away-players") ?? "").split(",").filter(Boolean);
    const homeWon = $row.attr("data-home-won") === "1";

    const sets: { home: number; away: number }[] = [];
    $row.find(".set").each((_i, setEl) => {
      const h = Number($(setEl).attr("data-home"));
      const a = Number($(setEl).attr("data-away"));
      if (Number.isFinite(h) && Number.isFinite(a)) {
        sets.push({ home: h, away: a });
      }
    });

    matches.push({
      playedOn: date,
      line,
      courtKind: kind,
      homePlayers,
      awayPlayers,
      sets,
      homeWon,
    });
  });
  return { tennislinkId, displayName, matches };
}

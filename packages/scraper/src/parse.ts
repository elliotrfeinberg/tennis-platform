// HTML parsers for tennislink pages.
//
// Scope: public, unauthenticated pages only. The match-history parser was
// removed when the team/player detail pages were confirmed auth-walled —
// that data path moves to the USTA Connect partner API.
//
// Selectors here are placeholders shaped around tennislink's public NTRP
// search; real selectors should be verified against captured HTML fixtures
// committed under src/__fixtures__/ before relying on them.

import * as cheerio from "cheerio";

export interface PlayerSearchResultRow {
  tennislinkId: string;
  displayName: string;
  section: string | undefined;
  state: string | undefined;
  publishedNtrp: number | undefined;
  gender: "M" | "F" | undefined;
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

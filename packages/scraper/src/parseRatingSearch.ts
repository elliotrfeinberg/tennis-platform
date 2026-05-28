// Parser for /Leagues/Reports/NTRP/SearchResults.aspx (the auth-walled
// NTRP rating search result page).
//
// One row per player who registered in the filter scope (e.g., NorCal
// Women's 3.5 in 2025). The "Year End Rating Level" column gives that
// player's USTA-assigned banded NTRP rating at the close of the year
// (3.0, 3.5, 4.0, etc.) — NOT the continuous in-band rating, which USTA
// doesn't publish. The Rating Type column distinguishes the source:
//
//   C  computer-rated (algorithm from match outcomes; most reliable)
//   S  self-rated or medical appeal
//   A  appealed
//   D  disqualification
//   E  early-start league dynamic
//   M  mixed-exclusive year-end rating
//   T  tournament-exclusive year-end rating
//
// The name column links to the player's profile (mode t=T-0) with a
// URL-encoded encrypted id. We expose both the raw href and the decoded
// par1 (base64-ish, with `=` padding) so callers can either chain to the
// profile or use it as a stable player key.
//
// Single search returns ~2000 rows in one page (no pagination observed
// for NorCal Women 3.5 — USTA dumps the whole filter scope at once).

import * as cheerio from "cheerio";

export interface RatingSearchRow {
  name: string; // "Lastname, Firstname"
  gender: "M" | "F" | undefined;
  city: string | undefined;
  state: string | undefined;
  // Banded NTRP level the player ended the year at. Decimal so 0.0 is
  // distinguishable from "no rating" (undefined).
  ntrpLevel: number | undefined;
  // Raw rating date string (e.g. "12/31/2025"). Year-end ratings are
  // dated Dec 31; appeals and self-rates date to when they were granted.
  ratingDate: string | undefined;
  // Single-letter source code; see file header for meanings.
  ratingType: string | undefined;
  // URL-encoded encrypted player id from the href.
  playerPar1Encoded: string | undefined;
  // Decoded form (single decodeURIComponent). The raw bytes are an
  // ASP.NET-encrypted identifier (base64-ish with =-padding); we don't
  // try to decode further. Use this as a stable player key across
  // searches.
  playerPar1: string | undefined;
}

export interface ParsedRatingSearch {
  // Filter context as rendered in the page header, e.g.
  // "USTA/NO. CALIFORNIA - NO. CALIFORNIA - 2025 ADULT 18&Over - Women's 3.5".
  // Used to know what scope this dump represents without re-deriving from
  // the URL params.
  context: string | undefined;
  rows: RatingSearchRow[];
}

export function parseRatingSearch(html: string): ParsedRatingSearch {
  const $ = cheerio.load(html);

  // Page header line: e.g.
  // "NTRP Information for:<br>USTA/NO. CALIFORNIA - NO. CALIFORNIA - 2025 ADULT 18&Over - Women's 3.5"
  // The <br> separates the label from the value; pull the value side.
  const headerMatch = html.match(
    /NTRP Information for:<br>([^<]+)/
  );
  const context = headerMatch ? headerMatch[1]!.trim() : undefined;

  const rows: RatingSearchRow[] = [];
  // DataGrid1 is the rendered ASP.NET DataGrid. Skip its first row
  // (column headers identified by class "tableHeaderRow").
  $("#DataGrid1 tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("tableHeaderRow")) return;
    const $cells = $tr.children("td");
    if ($cells.length < 7) return;

    const $anchor = $cells.eq(0).find("a").first();
    const nameRaw = $anchor.text().trim();
    if (!nameRaw) return;
    const name = nameRaw.replace(/\s+/g, " ").trim();
    const href = $anchor.attr("href") ?? "";
    const par1Encoded = (href.match(/par1=([^&]+)/) ?? [])[1];
    const par1 = par1Encoded ? safeDecodeURIComponent(par1Encoded) : undefined;

    const genderText = $cells.eq(1).text().trim();
    const gender =
      genderText === "M" ? "M" : genderText === "F" ? "F" : undefined;
    const city = $cells.eq(2).text().trim() || undefined;
    const state = $cells.eq(3).text().trim() || undefined;
    const ntrpText = $cells.eq(4).text().trim();
    const ntrpLevel =
      ntrpText && /^[0-9]+(?:\.[0-9]+)?$/.test(ntrpText)
        ? Number(ntrpText)
        : undefined;
    const ratingDate = $cells.eq(5).text().trim() || undefined;
    // The rating-type cell can render as "&nbsp;" when type is absent
    // (e.g., for 0.0 unrated rows). Treat single non-letter chars as
    // undefined.
    const ratingTypeRaw = $cells.eq(6).text().trim();
    const ratingType = /^[A-Z]$/.test(ratingTypeRaw)
      ? ratingTypeRaw
      : undefined;

    rows.push({
      name,
      gender,
      city,
      state,
      ntrpLevel,
      ratingDate,
      ratingType,
      playerPar1Encoded: par1Encoded,
      playerPar1: par1,
    });
  });

  return { context, rows };
}

function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

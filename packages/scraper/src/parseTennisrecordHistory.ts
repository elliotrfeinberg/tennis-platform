// Parse tennisrecord.com's match-history page for a player.
//
// URL: /adult/matchhistory.aspx?year=YEAR&playername=NAME (public, no auth)
//
// Each row has columns:
//   Match Date | League | Team | Court | Partner | Opponent(s) | W/L | Result | Match | Rating
//
// "Match" is the player's PERFORMANCE rating for that one match — the
// signal we want to extract to reverse-engineer score → rating-diff.
// "Rating" is their rolling dynamic rating *after* the match (not used
// for table-building, but kept for diagnostics).
//
// "Result" comes as concatenated set scores with no separators
// (e.g. "6-36-1" = 6-3, 6-1; "4-66-41-0" = 4-6, 6-4, 1-0 super-tiebreak).
// We parse with the rule: winner's games are 1–2 digits, opponent's are
// always 1 digit (loser games always 0–9 in any tennis format).

import * as cheerio from "cheerio";

export interface TennisrecordSet {
  // ALWAYS from the MATCH winner's perspective, regardless of which
  // side the page subject was on. Each set's two numbers are reported
  // as "match-winner-games — match-loser-games", so for a match the
  // page subject WON these are their games / opp games (winner first);
  // for a match they LOST these are opp games / their games.
  //
  // Note: a set that the match winner LOST will still appear "first
  // number < second" because the match winner had fewer games in that
  // particular set (e.g. they lost set 1 4-6 → "4-6"). This is unusual
  // — it's not "set-winner-first", it's "match-winner-first".
  playerGames: number;
  opponentGames: number;
}

export interface TennisrecordOpponent {
  name: string;
  // Pre-match dynamic rating as shown in parens, e.g. (2.80) → 2.8.
  // Undefined when tennisrecord doesn't have a rating yet (new player,
  // self-rate placeholder, etc.).
  rating: number | undefined;
}

export interface TennisrecordMatchRow {
  date: string; // MM/DD/YYYY
  league: string; // "Adult 18+3.5" (level concatenated to division)
  team: string;
  court: string; // "S1", "S2", "D1", "D2", etc.
  partner: string | undefined;
  opponents: TennisrecordOpponent[];
  won: boolean;
  sets: TennisrecordSet[];
  // The player's performance rating for this match. Empty string when
  // "NC" (not calculated) or "S" (involves a self-rated player and
  // therefore skipped by the official rating system).
  matchRating: number | undefined;
  // The player's rolling dynamic rating after this match.
  postMatchRating: number | undefined;
  // Raw (un-normalized) match-rating / post-rating cell text — useful
  // for debugging "NC" / "S" cases.
  matchRatingRaw: string;
  postMatchRatingRaw: string;
}

export interface ParsedTennisrecordHistory {
  // Identity from the header (e.g. "Stella So (Walnut Creek, CA) Female")
  // and current published NTRP level. Best-effort.
  playerName: string | undefined;
  playerLocation: string | undefined;
  publishedLevel: number | undefined;
  rows: TennisrecordMatchRow[];
}

export function parseTennisrecordHistory(
  html: string
): ParsedTennisrecordHistory {
  const $ = cheerio.load(html);

  // Header: first row of the first table usually has "Name (City, State)
  // Gender" in cell 1 and "3.5 C12/31/YYYY" in cell 2.
  let playerName: string | undefined;
  let playerLocation: string | undefined;
  let publishedLevel: number | undefined;
  $("table").each((_, t) => {
    if (playerName) return;
    const firstRow = $(t).find("tr").first();
    const cells = firstRow
      .find("td")
      .map((_i, c) => $(c).text().trim().replace(/\s+/g, " "))
      .get();
    if (cells.length < 2) return;
    const m = cells[0]!.match(/^([^(]+)\s*\(([^)]+)\)/);
    if (!m) return;
    playerName = m[1]!.trim();
    playerLocation = m[2]!.trim();
    const lvl = cells[1]!.match(/^(\d\.\d)/);
    if (lvl) publishedLevel = Number(lvl[1]);
  });

  // Match table: identified by the header row containing "Match Date"
  // and "Match" cells.
  let rows: TennisrecordMatchRow[] = [];
  $("table").each((_, t) => {
    if (rows.length > 0) return;
    const headers = $(t)
      .find("tr")
      .first()
      .find("td, th")
      .map((_i, c) => $(c).text().trim())
      .get();
    if (!headers.includes("Match Date") || !headers.includes("Match")) return;
    const idx = (label: string): number => headers.indexOf(label);
    const dateI = idx("Match Date");
    const leagueI = idx("League");
    const teamI = idx("Team");
    const courtI = idx("Court");
    const partnerI = idx("Partner");
    const oppI = idx("Opponent(s)");
    const wlI = idx("W/L");
    const resultI = idx("Result");
    const matchI = idx("Match");
    const ratingI = idx("Rating");

    $(t)
      .find("tr")
      .slice(1)
      .each((_j, r) => {
        const cells = $(r)
          .find("td")
          .map((_i, c) => $(c).text().trim().replace(/\s+/g, " "))
          .get();
        if (cells.length < headers.length) return;
        const won = cells[wlI]!.toUpperCase().startsWith("W");
        const opponents = parseOpponents(cells[oppI]!);
        const sets = parseScoreString(cells[resultI]!);
        const matchRating = parseRating(cells[matchI]!);
        const postMatchRating = parseRating(cells[ratingI]!);
        rows.push({
          date: cells[dateI]!,
          league: cells[leagueI]!,
          team: cells[teamI]!,
          court: cells[courtI]!,
          partner: cells[partnerI]!.trim() || undefined,
          opponents,
          won,
          sets,
          matchRating,
          postMatchRating,
          matchRatingRaw: cells[matchI]!,
          postMatchRatingRaw: cells[ratingI]!,
        });
      });
  });

  return { playerName, playerLocation, publishedLevel, rows };
}

// Parse the opponents cell. Doubles cells look like:
//   "Jane Doe(3.20)Mary Smith(3.35)"
// Singles is a single name + rating. Some entries lack the rating in
// parens (e.g. "Mary Smith" with no number) for self-rated/unrated.
function parseOpponents(cell: string): TennisrecordOpponent[] {
  const result: TennisrecordOpponent[] = [];
  // Split on the closing-paren-name-boundary heuristic: every name ends
  // with either a rating in parens OR end-of-string.
  const re = /([^()]+?)\((\d+\.\d+)\)|([^()]+)$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell)) !== null) {
    if (m[1] && m[2]) {
      result.push({ name: m[1].trim(), rating: Number(m[2]) });
    } else if (m[3] && m[3].trim()) {
      result.push({ name: m[3].trim(), rating: undefined });
    }
  }
  return result;
}

// Parse a concatenated set-score string. Each set: 1–2 digits, "-",
// 1 digit. Reads left-to-right; emits a TennisrecordSet per parsed set.
//
// Examples:
//   "6-36-1"         → [{6,3}, {6,1}]
//   "7-66-2"         → [{7,6}, {6,2}]
//   "4-66-41-0"      → [{4,6}, {6,4}, {1,0}] (super-tiebreak shown as 1-0)
//   "10-7"           → [{10,7}]  (match tiebreak first-to-10)
export function parseScoreString(s: string): TennisrecordSet[] {
  const sets: TennisrecordSet[] = [];
  let i = 0;
  while (i < s.length) {
    // Player's games (1–2 digits).
    let j = i;
    while (j < s.length && j - i < 2 && /\d/.test(s[j]!)) j += 1;
    if (j === i || s[j] !== "-") break;
    const playerGames = Number(s.slice(i, j));
    // Opponent's games (always 1 digit — loser side never exceeds 9 in
    // any tennis format).
    const lostCh = s[j + 1];
    if (!lostCh || !/\d/.test(lostCh)) break;
    const opponentGames = Number(lostCh);
    sets.push({ playerGames, opponentGames });
    i = j + 2;
  }
  return sets;
}

// Match/Rating cell parser. Empty string, "NC", "S" → undefined.
function parseRating(s: string): number | undefined {
  const t = s.trim();
  if (!t || /^(NC|S|U|D)$/.test(t)) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

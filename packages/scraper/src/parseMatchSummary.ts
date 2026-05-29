// Parser for the per-flight "Match Summary" view of the StatsAndStandings
// t=T-0 SPA (rendered via BrowserFetcher.fetchMatchSummary).
//
// The match list renders into table#tblMatchSummarySearch as a STACKED
// (label: value) layout — one match spans several <tr>s:
//
//   <tr> … 1011610209 …            Date:  12/29/2025 </tr>
//   <tr> Team:     WALNUT CREEK RC/Walnut Creek TC 40AW3.5C </tr>
//   <tr> Opponent: MORAGA CC 40AW3.5A </tr>
//   <tr> Action:   View Score  (onclick ViewScore(1011610209,7,…)) </tr>
//
// We only need the match id (→ scorecard t=7) and the date (→ incremental
// crawling); home/visitor team names come along for free. Per-court set
// scores are NOT here — fetch the scorecard by match id for those.

import * as cheerio from "cheerio";

export interface MatchSummaryRow {
  matchId: string;
  date: string | undefined; // "MM/DD/YYYY"
  homeTeam: string | undefined;
  visitorTeam: string | undefined;
}

export interface ParsedMatchSummary {
  // Header context (section / district / league / flight) when present.
  context: string | undefined;
  rows: MatchSummaryRow[];
}

const DATE_RE = /\d{1,2}\/\d{1,2}\/\d{4}/;

export function parseMatchSummary(html: string): ParsedMatchSummary {
  const $ = cheerio.load(html);

  const headerMatch = html.match(/NTRP Information for:<br>([^<]+)/);
  let context = headerMatch ? headerMatch[1]!.trim() : undefined;
  if (!context) {
    const ctx = $("#tblSubFlightForMatchSummaryHeader").text().trim();
    if (ctx) context = ctx.replace(/\s+/g, " ");
  }

  const rows: MatchSummaryRow[] = [];
  const seen = new Set<string>();

  // The league renders ~16 sub-flight tables that all share the
  // id="tblMatchSummarySearch". Each match is one block-row whose recursive
  // text holds everything in a stacked "label:value" form, e.g.:
  //   "1011610209 Date:12/29/2025 Team:WALNUT CREEK… Opponent:MORAGA CC…
  //    Action: View Score …"
  // We pick the tightest row per match: exactly ONE 8+ digit run (the match
  // id; dates have ≤4 in a run, and team-id columns aren't rendered here)
  // plus both Team: and Opponent: labels. Dedupe by id across nesting.
  $("#tblMatchSummarySearch tr").each((_, tr) => {
    const text = $(tr).text().replace(/\s+/g, " ").trim();
    const ids = text.match(/\d{8,}/g);
    if (!ids || ids.length !== 1) return;
    if (!/Team:/i.test(text) || !/Opponent:/i.test(text)) return;
    const matchId = ids[0]!;
    if (seen.has(matchId)) return;
    seen.add(matchId);
    const home = text.match(/Team:\s*(.+?)\s*Opponent:/i);
    const visitor = text.match(/Opponent:\s*(.+?)\s*(?:Action:|$)/i);
    rows.push({
      matchId,
      date: (text.match(DATE_RE) ?? [])[0],
      homeTeam: home ? home[1]!.trim() : undefined,
      visitorTeam: visitor ? visitor[1]!.trim() : undefined,
    });
  });

  // Fallback: if the stacked layout wasn't present, recover match ids from
  // the ViewScore(...) onclick handlers so callers still get the id list.
  if (rows.length === 0) {
    const seen = new Set<string>();
    for (const m of html.matchAll(/ViewScore\((\d{6,})\s*,/g)) {
      const id = m[1]!;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        matchId: id,
        date: undefined,
        homeTeam: undefined,
        visitorTeam: undefined,
      });
    }
  }

  return { context, rows };
}

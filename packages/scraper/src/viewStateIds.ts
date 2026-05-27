// Extract canonical USTA numeric IDs from the team-profile __VIEWSTATE.
//
// USTA's TennisLink redacts `Team ID: *****` in rendered HTML and renders
// player names as postback anchors with no exposed id. We tried following
// the player __doPostBack to get a detail page, but USTA's UpdatePanels +
// `CSRFInitRequestHandler` JS rewrites the CSRF token at send time — a
// static replay just bounces back to the team profile.
//
// What we *can* do, and what we do here: the ASP.NET ViewState is a
// base64 blob of length-prefixed strings, and USTA leaves the raw ids in
// plain text inside it. Decoding gives us:
//
//   - team ids   (start with "5083" in NorCal; 10 digits)
//   - match ids  (start with "1011" for our season; 10 digits)
//   - player ids (typically "2" + 9 digits; older accounts have 8-9 digit
//                 or "1180558264"-style legacy ids)
//
// Each id is followed in the binary by a marker triple that identifies
// what comes next:
//
//   id,year  \x1f \x08 \x05 <len> <name> ...    real entity (team, player,
//                                                or a date for a match id)
//   id,year  \x1f \x0c \x05 <len> CommandName   tab-control key/value pair
//                                                — skip these
//
// We anchor on the `\x1f\x08\x05` marker to extract names cleanly and
// categorize by what the name looks like (date → match, all-caps with
// digits → team, FirstName LastName → player).
//
// All assertions are verified against the captured fixture in
// viewStateIds.test.ts; if USTA changes the encoding, the tests catch it
// before ingest silently inserts duplicates.

import * as cheerio from "cheerio";

export interface ViewStateIds {
  // displayName → 10-or-so-digit USTA member id
  playersByName: Map<string, string>;
  // teamName → USTA team id (e.g. "5083144154")
  teamsByName: Map<string, string>;
  // match ids in document order. The string following each is a date
  // (e.g. "4/12/2026") which we don't preserve here — the team-profile
  // schedule parser is the authoritative source for date and opponent.
  matchIds: string[];
}

// Length-prefixed entity name. The `\x1f\x08\x05` marker discriminates
// real-entity rows from tab-label rows (which use `\x1f\x0c\x05`).
const ID_ENTITY_RE = /(\d{8,11}),(\d{4})\x1f\x08\x05/g;

export function extractViewStateIds(html: string): ViewStateIds {
  const $ = cheerio.load(html);
  const vs = $("input[name='__VIEWSTATE']").attr("value");
  if (!vs) {
    return {
      playersByName: new Map(),
      teamsByName: new Map(),
      matchIds: [],
    };
  }
  // base64 → binary string (one char per byte). The "binary" encoding
  // preserves every byte as a single code unit so charCodeAt() returns
  // the raw byte for length-prefix scanning.
  const decoded = Buffer.from(vs, "base64").toString("binary");

  const playersByName = new Map<string, string>();
  const teamsByName = new Map<string, string>();
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();

  ID_ENTITY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ID_ENTITY_RE.exec(decoded))) {
    const id = m[1]!;
    const markerEnd = m.index + m[0].length;
    if (markerEnd >= decoded.length) break;
    const lenByte = decoded.charCodeAt(markerEnd);
    if (lenByte < 1 || lenByte > 127) continue;
    const name = decoded.slice(markerEnd + 1, markerEnd + 1 + lenByte);
    if (name.length < lenByte) continue;
    // Real names are printable ASCII; reject any with control bytes
    // (would mean we mis-aligned the length prefix).
    if (!/^[\x20-\x7e]+$/.test(name)) continue;

    if (isMatchDate(name)) {
      if (!seenMatchIds.has(id)) {
        seenMatchIds.add(id);
        matchIds.push(id);
      }
      continue;
    }
    if (looksLikeTeamName(name)) {
      // setIfAbsent so the first standings occurrence wins; later
      // opponent references (same name, sometimes with embedded <br />)
      // don't overwrite.
      const key = normalizeTeamName(name);
      if (!teamsByName.has(key)) teamsByName.set(key, id);
      continue;
    }
    if (looksLikePersonName(name)) {
      if (!playersByName.has(name)) playersByName.set(name, id);
      continue;
    }
    // Anything else (e.g. control labels we don't recognize) is silently
    // ignored — better to under-report than misclassify.
  }

  return { playersByName, teamsByName, matchIds };
}

function isMatchDate(s: string): boolean {
  // USTA renders dates as M/D/YYYY or MM/DD/YYYY in the schedule.
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
}

function looksLikeTeamName(s: string): boolean {
  // Team names mix uppercase letters with digits / slashes / periods
  // (e.g. "WALNUT CREEK RC/Walnut Creek TC 18AW3.5A"). A reliable signal
  // is 3+ consecutive uppercase letters AND at least one digit somewhere.
  return /[A-Z]{3,}/.test(s) && /\d/.test(s);
}

function looksLikePersonName(s: string): boolean {
  // "First Last" with possible apostrophes, hyphens, middle names. Two
  // words minimum, each starting with a capital. Rejects tab labels like
  // "TeamSummary" (single token) and "Won 4-1" (digit-prefix).
  return /^[A-Z][a-z'-]+(?:\s+[A-Z][a-zA-Z'.\-]+){1,3}$/.test(s);
}

function normalizeTeamName(name: string): string {
  // USTA inserts "<br />" mid-name in some opponent display labels. Strip it.
  return name.replace(/\s*<br\s*\/?>\s*/gi, "").trim();
}

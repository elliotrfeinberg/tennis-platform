// URL builders for tennislink.usta.com.
//
// Two flavors:
//
// 1. Public (no auth): the NTRP advanced-search page. ASP.NET WebForms with
//    ViewState — real use requires a GET-then-POST handshake.
// 2. Auth-walled (USTA login required): StatsAndStandings.aspx and the
//    Scorecard endpoint. Callers pass these URLs through a PoliteFetcher
//    configured with the user's session cookies; the fetcher raises
//    LoginRequiredError on 302->login.
//
// URL shapes observed from real captured pages + the page's own JS handlers:
//   StatsAndStandings.aspx?t={mode}&par1={id}&par2={year}&par3={flight}
//   - t=3 : team profile page (roster + schedule + standings on one page).
//           par1 is USTA's encoded team identifier — a hex string. The same
//           team can have multiple par1 values depending on entry point;
//           any of them resolves to the same team.
//   - t=7 : match scorecard. par1 is the *simple numeric match id*
//           (e.g. 1011875447), extracted from the team profile's
//           ViewScore() onclick handlers.
//   - par2 : 4-digit season year.
//   - par3 : 0 in most cases; non-zero for sub-flights.

const BASE = "https://tennislink.usta.com";

export interface SearchCriteria {
  firstName?: string;
  lastName?: string;
  section?: string;
  state?: string;
  gender?: "M" | "F";
  ntrpLevel?: number;
}

// NTRP advanced search landing page.
//
// CAVEAT: this page is ASP.NET WebForms. The form posts back via
// __doPostBack with a __VIEWSTATE token, so a plain GET with these params
// returns the empty form. Real use requires: GET this URL, parse out
// __VIEWSTATE + __EVENTVALIDATION, POST them along with the search fields.
export function ratingSearchUrl(criteria: SearchCriteria): string {
  const params = new URLSearchParams();
  if (criteria.firstName) params.set("firstName", criteria.firstName);
  if (criteria.lastName) params.set("lastName", criteria.lastName);
  if (criteria.section) params.set("section", criteria.section);
  if (criteria.state) params.set("state", criteria.state);
  if (criteria.gender) params.set("gender", criteria.gender);
  if (criteria.ntrpLevel) params.set("ntrpLevel", String(criteria.ntrpLevel));
  return `${BASE}/leagues/reports/NTRP/AdvancedSearch.aspx?${params}`;
}

// ---- auth-walled team / match URLs ----
// All take USTA's encoded id (the 42-char hex string in par1) plus a year.

export interface TeamRef {
  par1: string; // encoded team id
  year: number; // season year, e.g. 2026
  flight?: number; // par3; 0 in most cases
}

// One page that combines the team's roster, season schedule, and per-match
// court summaries. The "?t=3" mode is "view this specific team".
export function teamProfileUrl(team: TeamRef): string {
  const flight = team.flight ?? 0;
  return (
    `${BASE}/Leagues/Main/StatsAndStandings.aspx` +
    `?t=3&par1=${encodeURIComponent(team.par1)}` +
    `&par2=${team.year}&par3=${flight}`
  );
}

// Standings for the team's league/flight. "?t=2" appears to be the
// flight-standings view. Verify against a captured page before relying.
export function flightStandingsUrl(team: TeamRef): string {
  const flight = team.flight ?? 0;
  return (
    `${BASE}/Leagues/Main/StatsAndStandings.aspx` +
    `?t=2&par1=${encodeURIComponent(team.par1)}` +
    `&par2=${team.year}&par3=${flight}`
  );
}

// Match scorecard with per-court / per-set scores. matchId is the simple
// numeric id extracted from team-profile ViewScore() onclicks — e.g.
// 1011875447. Same StatsAndStandings.aspx endpoint, mode t=7.
export interface ScorecardRef {
  matchId: string | number;
  year: number;
  flight?: number;
}
export function scorecardUrl(ref: ScorecardRef): string {
  const flight = ref.flight ?? 0;
  return (
    `${BASE}/Leagues/Main/StatsAndStandings.aspx` +
    `?t=7&par1=${encodeURIComponent(String(ref.matchId))}` +
    `&par2=${ref.year}&par3=${flight}`
  );
}

// NTRP Year-End Rating search results page. Returns one row per player
// in the (Section × Division × Flight × Gender) scope with that
// player's year-end banded rating. All tree-node ids must be supplied
// — they're captured once per (year, section) combination from the
// `/Leagues/Reports/NTRP/AdvancedSearch.aspx` wizard URL after USTA
// re-renders the tree.
//
// Verified id space (from a 2025 NorCal Women 3.5 fetch):
//   NationalNodeID=6243292 USTA/NATIONAL
//   SectionNodeID=6243303  USTA/NO. CALIFORNIA
//   DistrictNodeID=6243366 NO. CALIFORNIA
//   SubDistrictNodeID=6243551
//   DivisionNodeID=6245250 Adult 18&Over
//   FlightNodeID=6259005   Women's 3.5
//   GenderCode=F
//
// Other levels (Women's 3.0, 4.0, 4.5) and divisions (Men's, 40+, etc.)
// require their own FlightNodeID — capture interactively from a browser
// session for each scope.
export interface RatingSearchScope {
  cYear: number; // e.g. 2025
  nationalNodeId: string;
  sectionNodeId: string;
  districtNodeId: string;
  subDistrictNodeId: string;
  divisionNodeId: string;
  flightNodeId: string;
  genderCode: "M" | "F";
  // Leave empty to use the flight's implicit level filter; set to e.g.
  // "3.5" to narrow further within a flight. Per observed behavior the
  // empty value already returns ratings from 3.0 / 3.5 / 4.0 / 0.0
  // mixed together within a single 3.5 flight, so empty is usually fine.
  ntrpRating?: string;
}
export function ratingSearchResultsUrl(s: RatingSearchScope): string {
  const params = new URLSearchParams();
  params.set("Search", "TreeNode");
  params.set("update", "1");
  params.set("NationalNodeID", s.nationalNodeId);
  params.set("CYear", String(s.cYear));
  params.set("SectionNodeID", s.sectionNodeId);
  params.set("DistrictNodeID", s.districtNodeId);
  params.set("SubDistrictNodeID", s.subDistrictNodeId);
  params.set("DivisionNodeID", s.divisionNodeId);
  params.set("FlightNodeID", s.flightNodeId);
  params.set("GenderCode", s.genderCode);
  params.set("NTRPRating", s.ntrpRating ?? "");
  return `${BASE}/Leagues/Reports/NTRP/SearchResults.aspx?${params}`;
}

// Player-record page: all matches a player played in a given year,
// grouped by team-context. par1 is the player's hex token — different
// namespace from team par1s (34 chars vs ~42), discovered by clicking
// a roster name (a ViewScore-style __doPostBack) and reading the
// destination page's canonical share URL. Mode t=8.
export interface PlayerRef {
  par1: string; // player hex token, e.g. DB0015BB82D06F8695947B4A59485F5E2D
  year: number;
  flight?: number; // par3, 0 in the cases we've seen
}
export function playerProfileUrl(ref: PlayerRef): string {
  const flight = ref.flight ?? 0;
  return (
    `${BASE}/Leagues/Main/StatsAndStandings.aspx` +
    `?t=8&par1=${encodeURIComponent(ref.par1)}` +
    `&par2=${ref.year}&par3=${flight}`
  );
}

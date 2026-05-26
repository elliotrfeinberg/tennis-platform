// URL builders for tennislink.usta.com.
//
// We prefer the MOBILE site (m.tennislink.usta.com) wherever it has an
// equivalent page — it's what the USTA TennisLink iOS/Android app talks
// to, serves cleaner HTML, and has been more stable across redesigns.
// Desktop builders are kept for pages without a mobile equivalent.
//
// URL shapes verified against live tennislink in 2025-05.

const DESKTOP = "https://tennislink.usta.com";
const MOBILE = "https://m.tennislink.usta.com";

export interface SearchCriteria {
  firstName?: string;
  lastName?: string;
  section?: string;
  state?: string;
  gender?: "M" | "F";
  ntrpLevel?: number;
}

// Player rating search — mobile.
// e.g. https://m.tennislink.usta.com/ntrp/advancedsearch.aspx?lastName=Federer
export function ratingSearchUrl(criteria: SearchCriteria): string {
  const params = new URLSearchParams();
  if (criteria.firstName) params.set("firstName", criteria.firstName);
  if (criteria.lastName) params.set("lastName", criteria.lastName);
  if (criteria.section) params.set("section", criteria.section);
  if (criteria.state) params.set("state", criteria.state);
  if (criteria.gender) params.set("gender", criteria.gender);
  if (criteria.ntrpLevel) params.set("ntrpLevel", String(criteria.ntrpLevel));
  return `${MOBILE}/ntrp/advancedsearch.aspx?${params}`;
}

// Desktop equivalent of the rating search, in case mobile blocks us.
export function ratingSearchUrlDesktop(criteria: SearchCriteria): string {
  const params = new URLSearchParams();
  if (criteria.firstName) params.set("firstName", criteria.firstName);
  if (criteria.lastName) params.set("lastName", criteria.lastName);
  if (criteria.section) params.set("section", criteria.section);
  if (criteria.state) params.set("state", criteria.state);
  if (criteria.gender) params.set("gender", criteria.gender);
  if (criteria.ntrpLevel) params.set("ntrpLevel", String(criteria.ntrpLevel));
  return `${DESKTOP}/leagues/reports/NTRP/AdvancedSearch.aspx?${params}`;
}

// Per-player match history. The mobile site uses `par1=<numeric player id>`
// and `t=0` (which tab to show). The id is numeric, e.g. 2006671136.
// e.g. https://m.tennislink.usta.com/statsandstandings/statsandstandings.aspx?t=0&par1=2006671136
export function playerHistoryUrl(tennislinkId: string): string {
  const params = new URLSearchParams({ t: "0", par1: tennislinkId });
  return `${MOBILE}/statsandstandings/statsandstandings.aspx?${params}`;
}

// Team page (roster + season schedule). Desktop endpoint:
// https://tennislink.usta.com/LEAGUES/Reports/TennisLinkReports.aspx?Level=T&TeamCode=<code>&CYear=<year>
export function teamUrl(teamCode: string, year: number): string {
  const params = new URLSearchParams({
    Level: "T",
    TeamCode: teamCode,
    CYear: String(year),
  });
  return `${DESKTOP}/LEAGUES/Reports/TennisLinkReports.aspx?${params}`;
}

// Team Tennis stats search (junior team tennis flavor).
export function teamTennisStatsUrl(): string {
  return `${DESKTOP}/TeamTennis/Main/Stats.aspx?Load=AdvSearch`;
}

// League / standings advanced search entry point.
// Use to enumerate teams in a section / season.
export function standingsSearchUrl(): string {
  return `${MOBILE}/statsandstandings?SearchType=3`;
}

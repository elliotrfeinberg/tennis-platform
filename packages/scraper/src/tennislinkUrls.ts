// URL builders for tennislink.usta.com.
//
// These are the public-facing search and detail pages we'll crawl. URL
// shapes will need verification against the live site during the first
// real crawl; keeping them centralized here so changes are one-line.

const BASE = "https://tennislink.usta.com";

export interface SearchCriteria {
  firstName?: string;
  lastName?: string;
  section?: string;
  state?: string;
  gender?: "M" | "F";
  ntrpLevel?: number;
}

// Player rating search (the NTRP lookup page).
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

// Per-player detail (career match history with set scores).
export function playerHistoryUrl(tennislinkId: string): string {
  return `${BASE}/leagues/main/statsandstandings.aspx?p=1&id=${encodeURIComponent(
    tennislinkId
  )}`;
}

// Team roster + season schedule.
export function teamUrl(tennislinkId: string): string {
  return `${BASE}/leagues/Main/StatsAndStandings.aspx?t=${encodeURIComponent(
    tennislinkId
  )}`;
}

// Section + league index used to enumerate teams. Real URL shape verified
// during first crawl; keeping placeholder structure here.
export function leagueIndexUrl(section: string, season: string): string {
  return `${BASE}/leagues/Main/findLeague.aspx?section=${encodeURIComponent(
    section
  )}&season=${encodeURIComponent(season)}`;
}

// Historical backfill: list of completed seasons by section.
export function seasonArchiveUrl(section: string, year: number): string {
  return `${BASE}/leagues/Main/archives.aspx?section=${encodeURIComponent(
    section
  )}&year=${year}`;
}

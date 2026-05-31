// Pure helpers shared across the DB ingestion commands (load-players,
// backfill-scorecards, normalize-matches). Kept side-effect-free so they
// can be unit-tested without a database.

export type Gender = "M" | "F" | "X";

// USTA rating-search names are "Last, First" (the last name may itself be
// multi-word). Convert to display "First Last". Comma-less input passes
// through with whitespace collapsed.
export function firstLast(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  if (!m) return name.replace(/\s+/g, " ").trim();
  return `${m[2]!.trim()} ${m[1]!.trim()}`.replace(/\s+/g, " ").trim();
}

// Map a USTA gender code to our enum. Anything other than M/F is "X"
// (mixed / unknown).
export function mapGender(g: string | undefined): Gender {
  return g === "M" ? "M" : g === "F" ? "F" : "X";
}

// Parse a US "M/D/YYYY" date to a local Date. Returns null when the string
// is missing or doesn't lead with that pattern.
export function parseUsDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

export function genderWord(g: Gender): string {
  return g === "F" ? "Women's" : g === "M" ? "Men's" : "Mixed";
}

// Parse the flight code embedded in a USTA team name, e.g.
// "MORAGA CC 40AW3.5A" -> { division: 40, gender: "F", ntrp: 3.5 }.
// Two code shapes:
//   - Single-gender: <2-digit division><cat A|X><gender W|M|X><NTRP><letter?>,
//     e.g. "40AW3.5A". A category of "X" forces gender "X".
//   - Mixed: <2-digit division>MX<combined rating><letter?>, e.g. "18MX7.0",
//     "18MX10.0B" -> { division: 18, gender: "X", ntrp: 7.0 | 10.0 }.
// Ratings may be 1–2 digits before the decimal (3.5, 10.0). Returns null when
// the suffix doesn't match (e.g. combo/tri-level team names).
export function parseTeamCode(
  name: string
): { division: number; gender: Gender; ntrp: number } | null {
  // Mixed first — "MX" is a 2-char marker, not cat+gender.
  const mx = name.match(/(\d{2})MX(\d{1,2}\.\d)[A-Z]?\s*$/i);
  if (mx) return { division: Number(mx[1]), gender: "X", ntrp: Number(mx[2]) };

  const m = name.match(/(\d{2})([AX])([WMX])(\d{1,2}\.\d)[A-Z]?\s*$/i);
  if (!m) return null;
  const cat = m[2]!.toUpperCase();
  const gCode = m[3]!.toUpperCase();
  let gender: Gender = gCode === "W" ? "F" : gCode === "M" ? "M" : "X";
  if (cat === "X") gender = "X";
  return { division: Number(m[1]), gender, ntrp: Number(m[4]) };
}

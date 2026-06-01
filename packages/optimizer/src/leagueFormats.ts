// League → court-format registry.
//
// A USTA league's court layout (which lines are played) and its SCORING (points
// per line) vary by age division and type. This module is the single source of
// truth, keyed by league archetype parsed from the league NAME — the same
// spirit as classifyLeague in @tennis/calibrate. Confirmed against NorCal data:
//
//   Adult 18 & Over   → 2S + 3D, every court 1 pt        (5 pts, win @3)
//   Adult 40 & Over   → 1S + 3D, D1 worth 2 pts          (5 pts, win @3)
//   Adult 55/65+      → 3D                                (3 pts, win @2)
//   Mixed / Combo     → 3D                                (3 pts, win @2)
//   …Daytime variants → 1S + 2D                           (3 pts, win @2)
//
// `resolveFormat` decouples the two axes: the court SET comes from the
// empirical lines actually played in that flight when available (robust to
// odd out-of-section leagues), and POINTS come from the archetype rules
// (default 1, with the 40 & Over D1 = 2 exception).

import type { CourtKind, CourtSlot, MatchFormat } from "./format.js";

export interface CourtRef {
  kind: CourtKind;
  index: number;
}

// Canonical court ordering: singles first, then doubles, each by line number.
function sortCourts<T extends CourtRef>(courts: T[]): T[] {
  return [...courts].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "S" ? -1 : 1;
    return a.index - b.index;
  });
}

const norm = (s: string | undefined): string => (s ?? "").toLowerCase();

// Age division parsed from a league name ("…18 & Over", "40&Over", "55 and
// over" → 18 / 40 / 55). Returns undefined when no "<n> over" token is present.
function ageDivision(s: string): number | undefined {
  const m = s.match(/(\d{2})\s*(?:&|and)?\s*over/);
  return m ? Number(m[1]) : undefined;
}

function isDaytime(s: string): boolean {
  return s.includes("daytime");
}

function isMixedOrCombo(s: string): boolean {
  return s.includes("mixed") || s.includes("combo");
}

// Adult 40 & Over (and only that) scores first doubles as 2 points. Mixed,
// Combo and Daytime leagues weight every court 1.
function is40AndOver(s: string): boolean {
  return (
    !isMixedOrCombo(s) && !isDaytime(s) && ageDivision(s) === 40
  );
}

// Points for a given court under the archetype's scoring rules.
function pointsFor(leagueName: string, court: CourtRef): number {
  const s = norm(leagueName);
  if (is40AndOver(s) && court.kind === "D" && court.index === 1) return 2;
  return 1;
}

// The canonical court SET for a league when we have no empirical lines to go on.
function archetypeCourts(leagueName: string): CourtRef[] {
  const s = norm(leagueName);
  if (isDaytime(s)) {
    return [
      { kind: "S", index: 1 },
      { kind: "D", index: 1 },
      { kind: "D", index: 2 },
    ];
  }
  if (isMixedOrCombo(s)) {
    return [
      { kind: "D", index: 1 },
      { kind: "D", index: 2 },
      { kind: "D", index: 3 },
    ];
  }
  const age = ageDivision(s);
  if (age !== undefined && age >= 55) {
    return [
      { kind: "D", index: 1 },
      { kind: "D", index: 2 },
      { kind: "D", index: 3 },
    ];
  }
  if (age === 40) {
    return [
      { kind: "S", index: 1 },
      { kind: "D", index: 1 },
      { kind: "D", index: 2 },
      { kind: "D", index: 3 },
    ];
  }
  // 18 & Over and unknown adult → the most common 2S + 3D.
  return [
    { kind: "S", index: 1 },
    { kind: "S", index: 2 },
    { kind: "D", index: 1 },
    { kind: "D", index: 2 },
    { kind: "D", index: 3 },
  ];
}

function displayName(leagueName: string | undefined): string {
  const s = norm(leagueName);
  if (isDaytime(s)) return "Daytime (1S + 2D)";
  if (isMixedOrCombo(s)) return "Mixed / Combo (3D)";
  const age = ageDivision(s);
  if (age !== undefined && age >= 55) return `${age} & Over (3D)`;
  if (age === 40) return "40 & Over (1S + 3D, D1 ×2)";
  if (age === 18) return "18 & Over (2S + 3D)";
  return "Adult (2S + 3D)";
}

// Resolve a league name to its full court format with per-court points.
// `empiricalCourts` (the distinct (kind,line) actually observed for the flight)
// takes precedence for the court SET — so weird out-of-section layouts still
// work — while POINTS always come from the archetype rules.
export function resolveFormat(
  leagueName: string | undefined,
  empiricalCourts?: ReadonlyArray<CourtRef>
): MatchFormat {
  const set =
    empiricalCourts && empiricalCourts.length > 0
      ? sortCourts(empiricalCourts.map((c) => ({ kind: c.kind, index: c.index })))
      : sortCourts(archetypeCourts(leagueName ?? ""));
  const courts: CourtSlot[] = set.map((c) => ({
    kind: c.kind,
    index: c.index,
    points: pointsFor(leagueName ?? "", c),
  }));
  return { name: displayName(leagueName), courts };
}

// Total match points and the points needed to clinch (strict majority).
export function formatPoints(format: MatchFormat): {
  total: number;
  toClinch: number;
} {
  const total = format.courts.reduce((s, c) => s + (c.points ?? 1), 0);
  return { total, toClinch: Math.floor(total / 2) + 1 };
}

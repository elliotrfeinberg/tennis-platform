// USTA team-match formats. The two we care about for v1:
//
// - Adult 18+ / 40+ / 55+ etc: 2 singles + 3 doubles courts.
// - Mixed and some local leagues: 5 doubles courts.
// - Junior team tennis: varies; we'll add later.
//
// Each "court" is a slot that gets filled by either 1 player (singles)
// or 2 players (doubles).

export type CourtKind = "S" | "D";

export interface CourtSlot {
  index: number; // 1..N (line 1, line 2, ...)
  kind: CourtKind;
  // Match points this court is worth. Most leagues weight every court 1, but
  // some don't — e.g. NorCal Adult 40 & Over scores D1 as 2 points. Omitted
  // means 1. The team match is won by majority of POINTS, not courts.
  points?: number;
}

export interface MatchFormat {
  name: string;
  courts: readonly CourtSlot[];
}

export const FORMAT_ADULT_18: MatchFormat = {
  name: "USTA Adult League (2S + 3D)",
  courts: [
    { index: 1, kind: "S" },
    { index: 2, kind: "S" },
    { index: 1, kind: "D" },
    { index: 2, kind: "D" },
    { index: 3, kind: "D" },
  ],
};

export const FORMAT_MIXED_5D: MatchFormat = {
  name: "Mixed Doubles / Combo (5D)",
  courts: [
    { index: 1, kind: "D" },
    { index: 2, kind: "D" },
    { index: 3, kind: "D" },
    { index: 4, kind: "D" },
    { index: 5, kind: "D" },
  ],
};

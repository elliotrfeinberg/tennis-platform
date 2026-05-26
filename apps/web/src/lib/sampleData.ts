// Seed data for the lineup tool demo. Replace with real db reads in v1.
import type { RosterPlayer } from "@tennis/optimizer";

export interface SeedPlayer {
  id: string;
  name: string;
  publishedNtrp: number;
  glicko: number;
  rd: number;
}

// Approximate Glicko ratings per NTRP level:
// 3.0 = 1200, 3.5 = 1400, 4.0 = 1600, 4.5 = 1800, 5.0 = 2000
// (placeholder calibration; will be replaced by fit from real data)
export function glickoForNtrp(ntrp: number): number {
  return 1200 + (ntrp - 3.0) * 400;
}

export const SAMPLE_OUR_ROSTER: SeedPlayer[] = [
  { id: "p1", name: "Alex Rivera", publishedNtrp: 4.0, glicko: 1620, rd: 70 },
  { id: "p2", name: "Sam Chen", publishedNtrp: 4.0, glicko: 1610, rd: 75 },
  { id: "p3", name: "Jordan Park", publishedNtrp: 4.0, glicko: 1590, rd: 60 },
  { id: "p4", name: "Taylor Wu", publishedNtrp: 4.0, glicko: 1580, rd: 65 },
  { id: "p5", name: "Casey Doyle", publishedNtrp: 4.0, glicko: 1565, rd: 80 },
  { id: "p6", name: "Morgan Diaz", publishedNtrp: 4.0, glicko: 1555, rd: 70 },
  { id: "p7", name: "Riley Patel", publishedNtrp: 4.0, glicko: 1540, rd: 60 },
  { id: "p8", name: "Quinn Nakamura", publishedNtrp: 4.0, glicko: 1520, rd: 90 },
  { id: "p9", name: "Drew Larsen", publishedNtrp: 4.0, glicko: 1510, rd: 65 },
  { id: "p10", name: "Avery Brooks", publishedNtrp: 4.0, glicko: 1490, rd: 75 },
];

export const SAMPLE_OPP_ROSTER: SeedPlayer[] = [
  { id: "o1", name: "Pat Murphy", publishedNtrp: 4.0, glicko: 1600, rd: 70 },
  { id: "o2", name: "Lee Yamada", publishedNtrp: 4.0, glicko: 1580, rd: 70 },
  { id: "o3", name: "Cam Henderson", publishedNtrp: 4.0, glicko: 1560, rd: 70 },
  { id: "o4", name: "Sage O'Connell", publishedNtrp: 4.0, glicko: 1550, rd: 70 },
  { id: "o5", name: "Reese Acosta", publishedNtrp: 4.0, glicko: 1540, rd: 70 },
  { id: "o6", name: "Hayden Ruiz", publishedNtrp: 4.0, glicko: 1530, rd: 70 },
  { id: "o7", name: "Emerson Vance", publishedNtrp: 4.0, glicko: 1500, rd: 70 },
  { id: "o8", name: "Logan Pierce", publishedNtrp: 4.0, glicko: 1480, rd: 70 },
];

export function toRosterPlayer(p: SeedPlayer): RosterPlayer {
  return {
    id: p.id,
    name: p.name,
    rating: { rating: p.glicko, rd: p.rd, vol: 0.06 },
    available: true,
  };
}

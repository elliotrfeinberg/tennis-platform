// Fabricated but model-faithful demo data for the redesigned screens that
// aren't yet wired to the backend (Home, Search, H2H, Captain, Standings, Team,
// Match). Ported from the design bundle's data.js / data2.js. NTRP bands are
// half-open (N-0.5, N]; a 4.0 player sits in (3.5, 4.0], midpoint 3.75.

export type Cat = "adult" | "mixed";
export type Kind = "S" | "D";
// rating is null when that player was unrated at match time (UI shows a dash).
export type Named = [name: string, rating: number | null];

export interface LogEntry {
  date: string;
  cat: Cat;
  kind: Kind;
  line: number;
  partner?: Named;
  opp: Named[];
  oppTeam: string;
  sets: Array<[number, number]>;
  won: boolean;
  perf: number;
  opp_r: number;
  post: number;
}

export const player = {
  name: "Marcus Holloway",
  handle: "holloway-m",
  gender: "M" as const,
  memberId: "2049317756",
  section: "USTA / NorCal",
  homeTeam: "Cedar Park 4.0",
  band: 4.0,
  bandLow: 3.5,
  bandHigh: 4.0,
  midpoint: 3.75,
  perf: 3.94,
  adult: 3.96,
  mixed: 3.88,
  adultMatches: 11,
  mixedMatches: 2,
  confidence: "High",
  rd: 0.07,
  record: { w: 9, l: 4 },
  trend30: +0.06,
  rank: { pos: 142, of: 5180, band: "4.0 men · NorCal" },
};

export const log: LogEntry[] = [
  { date: "2025-04-12", cat: "adult", kind: "D", line: 2, partner: ["Sam Ito", 3.7], opp: [["Greg Pulle", 3.85], ["Tom Diaz", 3.58]], oppTeam: "Almaden Valley", sets: [[6, 3], [6, 4]], won: true, perf: 3.88, opp_r: 3.72, post: 3.66 },
  { date: "2025-04-19", cat: "adult", kind: "S", line: 2, opp: [["Raj Patel", 3.95]], oppTeam: "Bay Club SF", sets: [[3, 6], [4, 6]], won: false, perf: 3.55, opp_r: 3.95, post: 3.64 },
  { date: "2025-04-26", cat: "adult", kind: "D", line: 1, partner: ["Dre Cole", 3.9], opp: [["Will Hahn", 3.92], ["Owen Berg", 3.8]], oppTeam: "Los Gatos Swim", sets: [[7, 5], [6, 4]], won: true, perf: 3.93, opp_r: 3.86, post: 3.7 },
  { date: "2025-05-03", cat: "mixed", kind: "D", line: 2, partner: ["Lena Ross", 3.75], opp: [["Cam Wu", 3.82], ["Mia Fenn", 3.7]], oppTeam: "Stanford West", sets: [[6, 2], [6, 3]], won: true, perf: 3.96, opp_r: 3.76, post: 3.74 },
  { date: "2025-05-10", cat: "adult", kind: "S", line: 2, opp: [["Marco Vidal", 3.8]], oppTeam: "Sunnyvale TC", sets: [[6, 4], [4, 6], [8, 10]], won: false, perf: 3.72, opp_r: 3.8, post: 3.72 },
  { date: "2025-05-17", cat: "adult", kind: "D", line: 1, partner: ["Dre Cole", 3.9], opp: [["Nate Frye", 4.02], ["Eli Stone", 3.88]], oppTeam: "Berkeley Hills", sets: [[7, 6], [6, 4]], won: true, perf: 4.01, opp_r: 3.95, post: 3.78 },
  { date: "2025-05-31", cat: "adult", kind: "D", line: 2, partner: ["Sam Ito", 3.7], opp: [["Jon Ek", 3.84], ["Pat Lim", 3.79]], oppTeam: "Almaden Valley", sets: [[5, 7], [6, 3], [7, 10]], won: false, perf: 3.74, opp_r: 3.81, post: 3.76 },
  { date: "2025-06-07", cat: "adult", kind: "S", line: 1, opp: [["Andre Sato", 3.96]], oppTeam: "Bay Club SF", sets: [[7, 6], [6, 4]], won: true, perf: 3.99, opp_r: 3.96, post: 3.81 },
  { date: "2025-06-14", cat: "mixed", kind: "D", line: 1, partner: ["Lena Ross", 3.75], opp: [["Theo Park", 3.98], ["Ana Vela", 3.84]], oppTeam: "Stanford West", sets: [[6, 4], [6, 2]], won: true, perf: 4.03, opp_r: 3.91, post: 3.84 },
  { date: "2025-06-21", cat: "adult", kind: "D", line: 1, partner: ["Dre Cole", 3.9], opp: [["Will Hahn", 3.94], ["Owen Berg", 3.83]], oppTeam: "Los Gatos Swim", sets: [[6, 3], [7, 5]], won: true, perf: 4.0, opp_r: 3.88, post: 3.87 },
  { date: "2025-06-28", cat: "adult", kind: "S", line: 2, opp: [["Marco Vidal", 3.83]], oppTeam: "Sunnyvale TC", sets: [[4, 6], [6, 4], [8, 10]], won: false, perf: 3.81, opp_r: 3.83, post: 3.85 },
  { date: "2025-07-12", cat: "adult", kind: "D", line: 1, partner: ["Dre Cole", 3.91], opp: [["Nate Frye", 4.04], ["Eli Stone", 3.9]], oppTeam: "Berkeley Hills", sets: [[6, 2], [6, 4]], won: true, perf: 4.06, opp_r: 3.97, post: 3.9 },
  { date: "2025-07-19", cat: "adult", kind: "D", line: 2, partner: ["Sam Ito", 3.72], opp: [["Jon Ek", 3.86], ["Pat Lim", 3.8]], oppTeam: "Almaden Valley", sets: [[7, 5], [6, 4]], won: true, perf: 4.01, opp_r: 3.83, post: 3.92 },
  { date: "2025-07-26", cat: "adult", kind: "S", line: 2, opp: [["Andre Sato", 3.97]], oppTeam: "Bay Club SF", sets: [[6, 4], [7, 6]], won: true, perf: 4.03, opp_r: 3.97, post: 3.94 },
];

export const bands = [
  { year: 2023, ntrp: 3.5, type: "C" },
  { year: 2024, ntrp: 3.5, type: "C" },
  { year: 2025, ntrp: 4.0, type: "C" },
];

export interface DirRow {
  name: string; g: "M" | "F"; b25: number; b24: number; perf: number;
  type: string; trend: number; conf: "High" | "Med" | "Low";
}

export const directory: DirRow[] = [
  { name: "Marcus Holloway", g: "M", b25: 4.0, b24: 3.5, perf: 3.94, type: "C", trend: +0.06, conf: "High" },
  { name: "Dre Cole", g: "M", b25: 4.0, b24: 4.0, perf: 3.9, type: "C", trend: +0.01, conf: "High" },
  { name: "Andre Sato", g: "M", b25: 4.0, b24: 4.0, perf: 3.97, type: "C", trend: -0.02, conf: "High" },
  { name: "Nate Frye", g: "M", b25: 4.5, b24: 4.0, perf: 4.04, type: "C", trend: +0.09, conf: "Med" },
  { name: "Lena Ross", g: "F", b25: 3.5, b24: 3.5, perf: 3.61, type: "C", trend: +0.04, conf: "High" },
  { name: "Will Hahn", g: "M", b25: 4.0, b24: 4.0, perf: 3.94, type: "C", trend: +0.03, conf: "High" },
  { name: "Raj Patel", g: "M", b25: 4.0, b24: 3.5, perf: 3.95, type: "S", trend: +0.12, conf: "Low" },
  { name: "Mia Fenn", g: "F", b25: 3.5, b24: 3.5, perf: 3.7, type: "C", trend: +0.02, conf: "High" },
  { name: "Theo Park", g: "M", b25: 4.0, b24: 4.0, perf: 3.98, type: "C", trend: -0.01, conf: "High" },
  { name: "Owen Berg", g: "M", b25: 4.0, b24: 3.5, perf: 3.83, type: "C", trend: +0.05, conf: "Med" },
  { name: "Ana Vela", g: "F", b25: 4.0, b24: 3.5, perf: 3.84, type: "C", trend: +0.07, conf: "Med" },
  { name: "Marco Vidal", g: "M", b25: 3.5, b24: 3.5, perf: 3.83, type: "C", trend: +0.08, conf: "High" },
];

export const dist = [
  { band: 2.5, n: 612 }, { band: 3.0, n: 1840 }, { band: 3.5, n: 2410 },
  { band: 4.0, n: 1960 }, { band: 4.5, n: 1020 }, { band: 5.0, n: 338 },
];

export const fmtDate = (s: string): string => {
  const [, m, d] = s.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m!]} ${+d!}`;
};
export const score = (sets: Array<[number, number]>): string =>
  sets.map(([a, b]) => `${a}-${b}`).join("  ");

// ---- supplemental (MM2) ----

export interface RosterPlayer {
  name: string; band: number; perf: number; rd?: number;
  conf?: string; captain?: boolean;
}

export const cedar: RosterPlayer[] = [
  { name: "Marcus Holloway", band: 4.0, perf: 3.94, rd: 0.07, conf: "High", captain: true },
  { name: "Andre Sato", band: 4.0, perf: 3.97, rd: 0.08, conf: "High" },
  { name: "Theo Park", band: 4.0, perf: 3.98, rd: 0.1, conf: "High" },
  { name: "Dre Cole", band: 4.0, perf: 3.9, rd: 0.09, conf: "High" },
  { name: "Raj Patel", band: 4.0, perf: 3.95, rd: 0.21, conf: "Low" },
  { name: "Ben Ruiz", band: 4.0, perf: 3.88, rd: 0.11, conf: "Med" },
  { name: "Owen Berg", band: 4.0, perf: 3.83, rd: 0.12, conf: "Med" },
  { name: "Marco Vidal", band: 3.5, perf: 3.83, rd: 0.09, conf: "High" },
  { name: "Sam Ito", band: 3.5, perf: 3.71, rd: 0.12, conf: "High" },
  { name: "Cal Nguyen", band: 3.5, perf: 3.66, rd: 0.14, conf: "Med" },
];

export const almaden: RosterPlayer[] = [
  { name: "Nate Frye", band: 4.0, perf: 4.04 },
  { name: "Eli Stone", band: 4.0, perf: 3.9 },
  { name: "Jon Ek", band: 4.0, perf: 3.86 },
  { name: "Greg Pulle", band: 4.0, perf: 3.85 },
  { name: "Cam Wu", band: 3.5, perf: 3.82 },
  { name: "Pat Lim", band: 3.5, perf: 3.8 },
  { name: "Hugo Marsh", band: 3.5, perf: 3.77 },
  { name: "Tom Diaz", band: 3.5, perf: 3.58 },
];

export const matchMeta = { week: 7, date: "Aug 9", home: "Cedar Park 4.0", away: "Almaden Valley", at: "vs", format: "USTA Adult · 2S + 3D" };

export interface Lineup {
  teamWin: number; exp: number;
  courts: Array<{ c: string; players: string[]; wp: number }>;
}
export const lineups: Lineup[] = [
  { teamWin: 0.79, exp: 3.5, courts: [
    { c: "S1", players: ["Andre Sato"], wp: 0.61 },
    { c: "S2", players: ["Marcus Holloway"], wp: 0.66 },
    { c: "D1", players: ["Dre Cole", "Theo Park"], wp: 0.72 },
    { c: "D2", players: ["Ben Ruiz", "Owen Berg"], wp: 0.64 },
    { c: "D3", players: ["Sam Ito", "Marco Vidal"], wp: 0.58 },
  ] },
  { teamWin: 0.74, exp: 3.4, courts: [
    { c: "S1", players: ["Marcus Holloway"], wp: 0.63 },
    { c: "S2", players: ["Andre Sato"], wp: 0.59 },
    { c: "D1", players: ["Dre Cole", "Theo Park"], wp: 0.72 },
    { c: "D2", players: ["Ben Ruiz", "Marco Vidal"], wp: 0.61 },
    { c: "D3", players: ["Sam Ito", "Owen Berg"], wp: 0.6 },
  ] },
  { teamWin: 0.71, exp: 3.3, courts: [
    { c: "S1", players: ["Andre Sato"], wp: 0.61 },
    { c: "S2", players: ["Theo Park"], wp: 0.6 },
    { c: "D1", players: ["Marcus Holloway", "Dre Cole"], wp: 0.75 },
    { c: "D2", players: ["Ben Ruiz", "Owen Berg"], wp: 0.64 },
    { c: "D3", players: ["Sam Ito", "Marco Vidal"], wp: 0.55 },
  ] },
];
export const evaluated = 12600;

export interface Standing { team: string; w: number; l: number; cw: number; cl: number; me?: boolean }
export const standings: Standing[] = [
  { team: "Berkeley Hills", w: 6, l: 1, cw: 28, cl: 14 },
  { team: "Cedar Park 4.0", w: 5, l: 2, cw: 26, cl: 16, me: true },
  { team: "Bay Club SF", w: 5, l: 2, cw: 25, cl: 17 },
  { team: "Stanford West", w: 4, l: 3, cw: 23, cl: 19 },
  { team: "Los Gatos Swim", w: 3, l: 4, cw: 20, cl: 22 },
  { team: "Almaden Valley", w: 3, l: 4, cw: 19, cl: 23 },
  { team: "Sunnyvale TC", w: 2, l: 5, cw: 16, cl: 26 },
  { team: "Marin Tennis", w: 1, l: 6, cw: 12, cl: 30 },
];

export interface SchedMatch { week: number; at: string; opp: string; cw?: number; cl?: number; date?: string; plan?: boolean }
export const schedule: { played: SchedMatch[]; upcoming: SchedMatch[] } = {
  played: [
    { week: 1, at: "vs", opp: "Sunnyvale TC", cw: 4, cl: 1 },
    { week: 2, at: "@", opp: "Bay Club SF", cw: 2, cl: 3 },
    { week: 3, at: "vs", opp: "Marin Tennis", cw: 5, cl: 0 },
    { week: 4, at: "@", opp: "Los Gatos Swim", cw: 3, cl: 2 },
    { week: 5, at: "vs", opp: "Stanford West", cw: 4, cl: 1 },
    { week: 6, at: "@", opp: "Berkeley Hills", cw: 2, cl: 3 },
  ],
  upcoming: [
    { week: 7, at: "vs", opp: "Almaden Valley", date: "Aug 9", plan: true },
    { week: 8, at: "@", opp: "Sunnyvale TC", date: "Aug 16" },
    { week: 9, at: "vs", opp: "Bay Club SF", date: "Aug 23" },
  ],
};

export const team = { name: "Cedar Park 4.0", league: "Adult 40 & Over · 4.0 Men", section: "USTA NorCal", season: "Summer 2025", facility: "Cedar Park Racquet Club" };

export interface Mover { name: string; perf: number; t: number; note?: string }
export const movers: { up: Mover[]; down: Mover[] } = {
  up: [
    { name: "Raj Patel", perf: 3.95, t: +0.12, note: "self-rate settling" },
    { name: "Nate Frye", perf: 4.04, t: +0.09 },
    { name: "Marco Vidal", perf: 3.83, t: +0.08 },
    { name: "Ana Vela", perf: 3.84, t: +0.07 },
    { name: "Marcus Holloway", perf: 3.94, t: +0.06 },
  ],
  down: [
    { name: "Andre Sato", perf: 3.97, t: -0.02 },
    { name: "Theo Park", perf: 3.98, t: -0.01 },
  ],
};

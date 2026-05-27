// Hand-authored league: 6 teams, ~10 players each, USTA Pacific NW, 2026
// spring season. Single round-robin so every team plays every other team
// exactly once — 5 team-matches per team, 15 total.

import type {
  FixtureLeague,
  FixturePlayer,
  FixtureTeam,
} from "./types.js";

export const LEAGUE: FixtureLeague = {
  id: "lg-pnw-4.0-18u-2026s",
  name: "Adult 18+ 4.0 Men",
  section: "USTA/Pacific NW",
  season: "2026-spring",
  ntrpLevel: 4.0,
  format: "ADULT_2S_3D",
  teamIds: [
    "tm-cedar",
    "tm-rainier",
    "tm-greenlake",
    "tm-shoreline",
    "tm-westside",
    "tm-tideflats",
  ],
};

export const TEAMS: FixtureTeam[] = [
  {
    id: "tm-cedar",
    name: "Cedar Park Racquet Club",
    section: LEAGUE.section,
    league: LEAGUE.name,
    season: LEAGUE.season,
    ntrpLevel: 4.0,
    homeFacility: "Cedar Park RC",
    captainPlayerId: "pl-cedar-01",
  },
  {
    id: "tm-rainier",
    name: "Rainier Athletic Club",
    section: LEAGUE.section,
    league: LEAGUE.name,
    season: LEAGUE.season,
    ntrpLevel: 4.0,
    homeFacility: "Rainier AC",
    captainPlayerId: "pl-rainier-01",
  },
  {
    id: "tm-greenlake",
    name: "Green Lake Tennis Center",
    section: LEAGUE.section,
    league: LEAGUE.name,
    season: LEAGUE.season,
    ntrpLevel: 4.0,
    homeFacility: "Green Lake TC",
    captainPlayerId: "pl-greenlake-01",
  },
  {
    id: "tm-shoreline",
    name: "Shoreline Indoor Tennis",
    section: LEAGUE.section,
    league: LEAGUE.name,
    season: LEAGUE.season,
    ntrpLevel: 4.0,
    homeFacility: "Shoreline ITC",
    captainPlayerId: "pl-shoreline-01",
  },
  {
    id: "tm-westside",
    name: "Westside Tennis & Fitness",
    section: LEAGUE.section,
    league: LEAGUE.name,
    season: LEAGUE.season,
    ntrpLevel: 4.0,
    homeFacility: "Westside T&F",
    captainPlayerId: "pl-westside-01",
  },
  {
    id: "tm-tideflats",
    name: "Tideflats Tennis Club",
    section: LEAGUE.section,
    league: LEAGUE.name,
    season: LEAGUE.season,
    ntrpLevel: 4.0,
    homeFacility: "Tideflats TC",
    captainPlayerId: "pl-tideflats-01",
  },
];

// Rosters. Initial Glicko ratings are spread within a realistic 4.0 band
// (~1560-1700) with elevated RD for newcomers to mimic real Glicko shapes.
// Volatility uses Glicko-2 default 0.06 unless otherwise needed.

const VOL = 0.06;
const R = (rating: number, rd = 70) => ({ rating, rd, vol: VOL });

interface RawRoster {
  teamId: string;
  district: string;
  players: { name: string; ntrp: number; rating: number; rd?: number }[];
}

const RAW_ROSTERS: RawRoster[] = [
  {
    teamId: "tm-cedar",
    district: "Seattle",
    players: [
      { name: "Marcus Whitfield", ntrp: 4.0, rating: 1685, rd: 55 },
      { name: "Daniel Park", ntrp: 4.0, rating: 1660 },
      { name: "Jared Okafor", ntrp: 4.0, rating: 1635 },
      { name: "Ethan Liang", ntrp: 4.0, rating: 1620 },
      { name: "Brendan Hayes", ntrp: 4.0, rating: 1605, rd: 90 },
      { name: "Vikram Subramanian", ntrp: 4.0, rating: 1595 },
      { name: "Kyle Donovan", ntrp: 4.0, rating: 1580 },
      { name: "Ramon Castillo", ntrp: 4.0, rating: 1570, rd: 85 },
      { name: "Theo Briggs", ntrp: 3.5, rating: 1540 },
      { name: "Owen Nakajima", ntrp: 4.0, rating: 1530, rd: 95 },
    ],
  },
  {
    teamId: "tm-rainier",
    district: "Seattle",
    players: [
      { name: "Hiroshi Tanaka", ntrp: 4.0, rating: 1700, rd: 50 },
      { name: "Pedro Aguilar", ntrp: 4.0, rating: 1670 },
      { name: "Chris Bellamy", ntrp: 4.0, rating: 1645 },
      { name: "Luis Mendoza", ntrp: 4.0, rating: 1625 },
      { name: "Trent Ashby", ntrp: 4.0, rating: 1610 },
      { name: "Devin Park", ntrp: 4.0, rating: 1595 },
      { name: "Anil Krishnan", ntrp: 4.0, rating: 1580, rd: 75 },
      { name: "Jorge Salinas", ntrp: 4.0, rating: 1560 },
      { name: "Ben Stratton", ntrp: 3.5, rating: 1545, rd: 95 },
      { name: "Wes Kowalski", ntrp: 4.0, rating: 1525 },
    ],
  },
  {
    teamId: "tm-greenlake",
    district: "Seattle",
    players: [
      { name: "Antonio Reyes", ntrp: 4.0, rating: 1665 },
      { name: "Michael O'Sullivan", ntrp: 4.0, rating: 1645, rd: 60 },
      { name: "Ravi Iyer", ntrp: 4.0, rating: 1630 },
      { name: "Tomas Volkov", ntrp: 4.0, rating: 1610 },
      { name: "Greg Halberg", ntrp: 4.0, rating: 1600 },
      { name: "Dustin Mahoney", ntrp: 4.0, rating: 1585 },
      { name: "Wei Zhang", ntrp: 4.0, rating: 1570, rd: 80 },
      { name: "Cole Henderson", ntrp: 3.5, rating: 1555 },
      { name: "Adrian Cabrera", ntrp: 4.0, rating: 1540 },
      { name: "Sean Murray", ntrp: 3.5, rating: 1515, rd: 100 },
    ],
  },
  {
    teamId: "tm-shoreline",
    district: "North Sound",
    players: [
      { name: "Felix Brennan", ntrp: 4.0, rating: 1675, rd: 55 },
      { name: "Karan Mehta", ntrp: 4.0, rating: 1650 },
      { name: "Justin Hwang", ntrp: 4.0, rating: 1625 },
      { name: "Mateo Vargas", ntrp: 4.0, rating: 1610 },
      { name: "Patrick Donnelly", ntrp: 4.0, rating: 1595, rd: 75 },
      { name: "Ahmed Saleh", ntrp: 4.0, rating: 1580 },
      { name: "Reggie Holmes", ntrp: 4.0, rating: 1565 },
      { name: "Jamie Goldstein", ntrp: 3.5, rating: 1550, rd: 85 },
      { name: "Sergio Pelletier", ntrp: 4.0, rating: 1535 },
      { name: "Calvin Yates", ntrp: 4.0, rating: 1520 },
    ],
  },
  {
    teamId: "tm-westside",
    district: "Eastside",
    players: [
      { name: "Nikhil Bhatt", ntrp: 4.0, rating: 1655 },
      { name: "Garrett Faulkner", ntrp: 4.0, rating: 1640 },
      { name: "Diego Romero", ntrp: 4.0, rating: 1620 },
      { name: "Logan Pierce", ntrp: 4.0, rating: 1600, rd: 65 },
      { name: "Yuto Kawasaki", ntrp: 4.0, rating: 1585 },
      { name: "Bryce Atherton", ntrp: 4.0, rating: 1570 },
      { name: "Hamza Qureshi", ntrp: 4.0, rating: 1555, rd: 80 },
      { name: "Eli Rosenberg", ntrp: 3.5, rating: 1540 },
      { name: "Marco Ricci", ntrp: 4.0, rating: 1525 },
      { name: "Nathan Beckford", ntrp: 3.5, rating: 1505, rd: 100 },
    ],
  },
  {
    teamId: "tm-tideflats",
    district: "South Sound",
    players: [
      { name: "Ibrahim Yusuf", ntrp: 4.0, rating: 1660 },
      { name: "Sam Whitlock", ntrp: 4.0, rating: 1635 },
      { name: "Kenji Morimoto", ntrp: 4.0, rating: 1615 },
      { name: "Pablo Estrada", ntrp: 4.0, rating: 1600 },
      { name: "Connor Vaughn", ntrp: 4.0, rating: 1585, rd: 75 },
      { name: "Andre Beaulieu", ntrp: 4.0, rating: 1570 },
      { name: "Kris Lindholm", ntrp: 4.0, rating: 1555 },
      { name: "Tariq Hassan", ntrp: 3.5, rating: 1540, rd: 90 },
      { name: "Beto Rivera", ntrp: 4.0, rating: 1525 },
      { name: "Dean Chambliss", ntrp: 3.5, rating: 1510, rd: 95 },
    ],
  },
];

function teamSuffix(teamId: string): string {
  return teamId.replace("tm-", "");
}

export const PLAYERS: FixturePlayer[] = RAW_ROSTERS.flatMap((roster) =>
  roster.players.map((p, i) => {
    const idx = String(i + 1).padStart(2, "0");
    return {
      id: `pl-${teamSuffix(roster.teamId)}-${idx}`,
      displayName: p.name,
      section: LEAGUE.section,
      district: roster.district,
      gender: "M" as const,
      publishedNtrp: p.ntrp,
      initialRating: R(p.rating, p.rd),
      teamId: roster.teamId,
    };
  })
);

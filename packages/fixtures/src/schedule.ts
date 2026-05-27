// Round-robin schedule, 6 teams, 5 weeks. Each team plays every other team
// exactly once. Mid-season relative to today (2026-05-26): weeks 1-3 played,
// weeks 4-5 upcoming.
//
// Pairings are built from the canonical circle-rotation: fix Cedar, rotate
// the others around. Each row is one week of three simultaneous meetings.

import type { FixtureTeamMatch } from "./types.js";
import { LEAGUE } from "./league.js";

interface WeekPlan {
  week: number;
  playedOn: string; // ISO date
  pairings: [string, string][]; // [home, away]
}

const SCHEDULE_PLAN: WeekPlan[] = [
  {
    week: 1,
    playedOn: "2026-05-10",
    pairings: [
      ["tm-cedar", "tm-rainier"],
      ["tm-tideflats", "tm-greenlake"],
      ["tm-westside", "tm-shoreline"],
    ],
  },
  {
    week: 2,
    playedOn: "2026-05-17",
    pairings: [
      ["tm-greenlake", "tm-cedar"],
      ["tm-rainier", "tm-shoreline"],
      ["tm-tideflats", "tm-westside"],
    ],
  },
  {
    week: 3,
    playedOn: "2026-05-24",
    pairings: [
      ["tm-cedar", "tm-shoreline"],
      ["tm-greenlake", "tm-westside"],
      ["tm-rainier", "tm-tideflats"],
    ],
  },
  {
    week: 4,
    playedOn: "2026-05-31",
    pairings: [
      ["tm-westside", "tm-cedar"],
      ["tm-shoreline", "tm-tideflats"],
      ["tm-rainier", "tm-greenlake"],
    ],
  },
  {
    week: 5,
    playedOn: "2026-06-07",
    pairings: [
      ["tm-cedar", "tm-tideflats"],
      ["tm-shoreline", "tm-greenlake"],
      ["tm-westside", "tm-rainier"],
    ],
  },
];

// "Today" for fixture purposes — anchors which weeks are played vs upcoming.
// Matches the current session date so the UI feels current.
export const FIXTURE_TODAY = "2026-05-26";

export const TEAM_MATCHES: FixtureTeamMatch[] = SCHEDULE_PLAN.flatMap((week) =>
  week.pairings.map(([home, away]) => ({
    id: `tmm-w${week.week}-${home}-${away}`,
    leagueId: LEAGUE.id,
    week: week.week,
    playedOn: week.playedOn,
    homeTeamId: home,
    awayTeamId: away,
    // courts populated by the match-result generator for played weeks
    courts: null,
  }))
);

export function isPlayed(playedOn: string): boolean {
  return playedOn <= FIXTURE_TODAY;
}

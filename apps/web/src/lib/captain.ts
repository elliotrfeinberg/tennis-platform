import "server-only";
import {
  optimizeLineup,
  FORMAT_ADULT_18,
  type RosterPlayer,
  type OpponentLineup,
  type OpponentCourt,
} from "@tennis/optimizer";
import { listFlights, flightStandings, subflightStandings, teamUpcomingMatches, teamDetail, type StandingRow } from "./teams";
import type { Scope } from "./scopeShared";

export interface CaptainView {
  flights: Array<{ id: string; label: string }>;
  flightId: string;
  teams: Array<{ id: string; name: string }>;
  myTeamId: string;
  oppTeamId: string;
  myName: string;
  oppName: string;
  // True when the opponent was prefilled from my team's next scheduled match.
  oppFromSchedule: boolean;
  myRoster: Array<{ id: string; name: string; perf: number | null; band: number | null }>;
  oppRoster: Array<{ id: string; name: string; perf: number | null; band: number | null }>;
  // Standings of the scoped subflight/flight (the "teams you play") — ranked.
  standings: Array<{ id: string; name: string; w: number; l: number; cw: number; cl: number }>;
  lineups: Array<{ teamWin: number; exp: number; courts: Array<{ c: string; players: string[]; wp: number }> }>;
  evaluated: number;
  error?: string;
}

export async function buildCaptain(opts: {
  flightId?: string;
  myTeamId?: string;
  oppTeamId?: string;
  scope?: Scope;
}): Promise<CaptainView | null> {
  const flights = await listFlights();
  if (flights.length === 0) return null;
  // Scope drives defaults: a scoped flight pre-selects it; a scoped subflight
  // narrows the team universe to that real round-robin pod.
  const scope = opts.scope;
  const flightId =
    (opts.flightId && flights.some((f) => f.id === opts.flightId) && opts.flightId) ||
    (scope?.flight && flights.some((f) => f.id === scope.flight) && scope.flight) ||
    flights[0]!.id;
  const standingsRows: StandingRow[] = scope?.subflight
    ? await subflightStandings(scope.subflight)
    : (await flightStandings(flightId)).rows;
  const teams = standingsRows.map((s) => ({ id: s.id, name: s.name }));
  const myTeamId = opts.myTeamId && teams.some((t) => t.id === opts.myTeamId) ? opts.myTeamId : teams[0]?.id ?? "";

  // Opponent: explicit > my team's next scheduled opponent > first other team.
  let oppTeamId = "";
  let oppFromSchedule = false;
  if (opts.oppTeamId && teams.some((t) => t.id === opts.oppTeamId) && opts.oppTeamId !== myTeamId) {
    oppTeamId = opts.oppTeamId;
  } else if (myTeamId) {
    const next = await teamUpcomingMatches(myTeamId);
    if (next && teams.some((t) => t.id === next.oppTeamId)) {
      oppTeamId = next.oppTeamId;
      oppFromSchedule = true;
    }
  }
  if (!oppTeamId) oppTeamId = teams.find((t) => t.id !== myTeamId)?.id ?? "";

  const flightList = flights.map((f) => ({ id: f.id, label: `${f.league} · ${f.name}` }));
  const base = {
    flights: flightList, flightId, teams, myTeamId, oppTeamId, oppFromSchedule,
    standings: standingsRows,
    myName: teams.find((t) => t.id === myTeamId)?.name ?? "—",
    oppName: teams.find((t) => t.id === oppTeamId)?.name ?? "—",
  };

  const [mine, opp] = await Promise.all([
    myTeamId ? teamDetail(myTeamId) : Promise.resolve(null),
    oppTeamId ? teamDetail(oppTeamId) : Promise.resolve(null),
  ]);
  const myRoster = mine?.roster ?? [];
  const oppRoster = opp?.roster ?? [];

  const view: CaptainView = {
    ...base, myRoster, oppRoster, lineups: [], evaluated: 0,
  };

  // Cap to each team's top rated players — a captain optimizes from their best,
  // and unbounded enumeration over a large roster (2S+3D) is intractable.
  const myRated = myRoster.filter((p) => p.perf != null).slice(0, 10);
  const oppRated = oppRoster.filter((p) => p.perf != null).slice(0, 8);
  if (myRated.length < 8 || oppRated.length < 8) {
    view.error = "Need at least 8 rated players on each team to optimize (perf ratings fill in as scorecards are crawled).";
    return view;
  }

  const roster: RosterPlayer[] = myRated.map((p) => ({
    id: p.id, name: p.name, rating: p.perf!, available: true,
  }));

  // Projected opponent lineup: strongest-first into 2S + 3D (NTRP ratings).
  const oppSorted = [...oppRated].sort((a, b) => b.perf! - a.perf!);
  let oi = 0;
  const courts: OpponentCourt[] = FORMAT_ADULT_18.courts.map((c) => {
    if (c.kind === "S") return { kind: "S", player: oppSorted[oi++]!.perf! };
    const a = oppSorted[oi++]!.perf!;
    const b = oppSorted[oi++]!.perf!;
    return { kind: "D", a, b };
  });
  const opponent: OpponentLineup = { courts };

  let result;
  try {
    result = optimizeLineup(roster, FORMAT_ADULT_18, opponent, { topN: 3 });
  } catch (e) {
    view.error = e instanceof Error ? e.message : String(e);
    return view;
  }
  const nameById = new Map(roster.map((p) => [p.id, p.name]));
  view.evaluated = result.evaluated;
  view.lineups = result.byTeamWinProb.map((lu) => ({
    teamWin: lu.teamWinProb,
    exp: lu.expectedWins,
    courts: lu.assignments.map((a) => ({
      c: `${a.slot.kind}${a.slot.index}`,
      players: a.ourPlayerIds.map((id) => nameById.get(id) ?? "?"),
      wp: a.winProb,
    })),
  }));
  return view;
}

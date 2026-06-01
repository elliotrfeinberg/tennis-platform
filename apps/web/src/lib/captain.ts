import "server-only";
import {
  optimizeLineup,
  resolveFormat,
  formatPoints,
  teamNtrp,
  type MatchFormat,
  type RosterPlayer,
  type OpponentLineup,
  type OpponentCourt,
} from "@tennis/optimizer";
import {
  listFlights,
  flightStandings,
  subflightStandings,
  flightCourts,
  teamUpcomingMatches,
  teamLineupHistory,
  teamPartnerCounts,
  teamDetail,
  type StandingRow,
  type RosterPlayerRow,
  type PlayerLineHistory,
} from "./teams";
import type { Scope } from "./scopeShared";

// Roster player as surfaced to the captain UI + sandbox. Carries the hidden
// per-kind ratings so the client sandbox can compute odds locally.
export interface CaptainPlayer {
  id: string;
  name: string;
  perf: number | null;
  band: number | null;
  singles: number | null;
  doubles: number | null;
  singlesMatches: number;
  doublesMatches: number;
}

export interface FormatCourtView {
  c: string; // "S1", "D1", …
  kind: "S" | "D";
  points: number;
}

export interface FormatView {
  name: string;
  total: number;
  toClinch: number;
  courts: FormatCourtView[];
}

export interface OppCourtView {
  c: string;
  kind: "S" | "D";
  points: number;
  // Effective court rating (singles rating, or the doubles team rating) — the
  // number the optimizer matches your side against.
  rating: number | null;
  // Projected opponent player(s) at this court + how often they play here.
  players: Array<{ id: string; name: string; propensity: number; rating: number | null }>;
}

export interface LineupCourtView {
  c: string;
  kind: "S" | "D";
  points: number;
  players: string[];
  playerIds: string[];
  wp: number;
  // True for a doubles court whose two players are an established pair.
  established: boolean;
}

export interface LineupView {
  teamWin: number;
  expPoints: number;
  courts: LineupCourtView[];
}

export interface CaptainView {
  flights: Array<{ id: string; label: string }>;
  flightId: string;
  teams: Array<{ id: string; name: string }>;
  myTeamId: string;
  oppTeamId: string;
  myName: string;
  oppName: string;
  oppFromSchedule: boolean;
  format: FormatView;
  myRoster: CaptainPlayer[];
  oppRoster: CaptainPlayer[];
  // Projected opponent lineup (one entry per court, in format order).
  oppProjection: OppCourtView[];
  standings: StandingRow[];
  lineups: LineupView[];
  evaluated: number;
  error?: string;
}

const ratingFor = (
  p: CaptainPlayer,
  kind: "S" | "D"
): number => (kind === "S" ? p.singles ?? p.perf! : p.doubles ?? p.perf!);

// Greedily project the opponent's most-likely lineup over the format's courts:
// assign each player to the court they most often play (highest historical
// count first), then fill any empty slots with the strongest leftover players.
function projectOpponent(
  format: MatchFormat,
  oppPool: CaptainPlayer[],
  hist: Map<string, PlayerLineHistory>
): Array<{ kind: "S" | "D"; players: CaptainPlayer[] }> {
  const slots = format.courts.map((c) => ({
    label: `${c.kind}${c.index}`,
    kind: c.kind,
    cap: c.kind === "S" ? 1 : 2,
    filled: [] as string[],
  }));
  const byId = new Map(oppPool.map((p) => [p.id, p]));
  const used = new Set<string>();

  // (player, court) candidates ranked by how often the player plays that court.
  const cands: Array<{ pid: string; slot: number; score: number }> = [];
  oppPool.forEach((p) => {
    const h = hist.get(p.id);
    slots.forEach((s, si) => {
      const spot = h?.spots.find((x) => x.court === s.label);
      cands.push({ pid: p.id, slot: si, score: spot?.count ?? 0 });
    });
  });
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands) {
    if (c.score <= 0 || used.has(c.pid)) continue;
    const s = slots[c.slot]!;
    if (s.filled.length >= s.cap) continue;
    s.filled.push(c.pid);
    used.add(c.pid);
  }
  // Fill remaining empty slots with strongest unused players.
  const leftover = oppPool
    .filter((p) => !used.has(p.id))
    .sort((a, b) => (b.perf ?? 0) - (a.perf ?? 0));
  let li = 0;
  for (const s of slots) {
    while (s.filled.length < s.cap && li < leftover.length) {
      const p = leftover[li++]!;
      s.filled.push(p.id);
      used.add(p.id);
    }
  }
  return slots.map((s) => ({
    kind: s.kind,
    players: s.filled.map((pid) => byId.get(pid)!).filter(Boolean),
  }));
}

export async function buildCaptain(opts: {
  flightId?: string;
  myTeamId?: string;
  oppTeamId?: string;
  unavailable?: string[];
  scope?: Scope;
}): Promise<CaptainView | null> {
  const flights = await listFlights();
  if (flights.length === 0) return null;
  const scope = opts.scope;
  const flightId =
    (opts.flightId && flights.some((f) => f.id === opts.flightId) && opts.flightId) ||
    (scope?.flight && flights.some((f) => f.id === scope.flight) && scope.flight) ||
    flights[0]!.id;
  const flight = flights.find((f) => f.id === flightId)!;

  const standingsRows: StandingRow[] = scope?.subflight
    ? await subflightStandings(scope.subflight)
    : (await flightStandings(flightId)).rows;
  const teams = standingsRows.map((s) => ({ id: s.id, name: s.name }));
  const myTeamId =
    opts.myTeamId && teams.some((t) => t.id === opts.myTeamId)
      ? opts.myTeamId
      : teams[0]?.id ?? "";

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

  // Resolve the league's real court format (lines + points) from the league
  // name, using the flight's empirical lines as the authoritative court set.
  const empirical = await flightCourts(flightId);
  const fmt = resolveFormat(flight.league, empirical);
  const { total, toClinch } = formatPoints(fmt);
  const formatView: FormatView = {
    name: fmt.name,
    total,
    toClinch,
    courts: fmt.courts.map((c) => ({ c: `${c.kind}${c.index}`, kind: c.kind, points: c.points ?? 1 })),
  };
  const slotsNeeded = fmt.courts.reduce((n, c) => n + (c.kind === "S" ? 1 : 2), 0);

  const flightList = flights.map((f) => ({ id: f.id, label: `${f.league} · ${f.name}` }));
  const toCaptainPlayer = (r: RosterPlayerRow): CaptainPlayer => ({
    id: r.id, name: r.name, perf: r.perf, band: r.band,
    singles: r.singles, doubles: r.doubles,
    singlesMatches: r.singlesMatches, doublesMatches: r.doublesMatches,
  });

  const [mine, opp] = await Promise.all([
    myTeamId ? teamDetail(myTeamId) : Promise.resolve(null),
    oppTeamId ? teamDetail(oppTeamId) : Promise.resolve(null),
  ]);
  const myRoster = (mine?.roster ?? []).map(toCaptainPlayer);
  const oppRoster = (opp?.roster ?? []).map(toCaptainPlayer);

  const base: CaptainView = {
    flights: flightList,
    flightId,
    teams,
    myTeamId,
    oppTeamId,
    oppFromSchedule,
    myName: teams.find((t) => t.id === myTeamId)?.name ?? "—",
    oppName: teams.find((t) => t.id === oppTeamId)?.name ?? "—",
    format: formatView,
    myRoster,
    oppRoster,
    oppProjection: [],
    standings: standingsRows,
    lineups: [],
    evaluated: 0,
  };

  // Project the opponent lineup from their line history (over the real format).
  const oppHist = oppTeamId ? await teamLineupHistory(oppTeamId) : new Map();
  const oppPool = oppRoster.filter((p) => p.perf != null).slice(0, 14);
  if (oppPool.length >= slotsNeeded) {
    const projection = projectOpponent(fmt, oppPool, oppHist);
    base.oppProjection = projection.map((c, i) => {
      const slot = fmt.courts[i]!;
      const label = `${slot.kind}${slot.index}`;
      const players = c.players.map((p) => {
        const h = oppHist.get(p.id);
        const spot = h?.spots.find((x: { court: string }) => x.court === label);
        const propensity = h && h.total > 0 ? (spot?.count ?? 0) / h.total : 0;
        return { id: p.id, name: p.name, propensity, rating: ratingFor(p, slot.kind) };
      });
      // Effective court rating: the singles rating, or the doubles team rating.
      let rating: number | null = null;
      if (slot.kind === "S" && c.players[0]) rating = ratingFor(c.players[0], "S");
      else if (slot.kind === "D" && c.players[0] && c.players[1])
        rating = teamNtrp({ a: ratingFor(c.players[0], "D"), b: ratingFor(c.players[1], "D") });
      return { c: label, kind: slot.kind, points: slot.points ?? 1, rating, players };
    });
  }

  // Build the optimizer roster (mine), applying availability and capping to the
  // strongest available players to keep enumeration tractable.
  const unavailable = new Set(opts.unavailable ?? []);
  const availPool = myRoster
    .filter((p) => p.perf != null && !unavailable.has(p.id))
    .sort((a, b) => (b.perf ?? 0) - (a.perf ?? 0))
    .slice(0, 10);

  if (availPool.length < slotsNeeded || base.oppProjection.length !== fmt.courts.length) {
    base.error = `Need at least ${slotsNeeded} available rated players on each team to optimize (perf ratings fill in as scorecards are crawled).`;
    return base;
  }

  const roster: RosterPlayer[] = availPool.map((p) => ({
    id: p.id,
    name: p.name,
    singlesRating: ratingFor(p, "S"),
    doublesRating: ratingFor(p, "D"),
    singlesMatches: p.singlesMatches,
    doublesMatches: p.doublesMatches,
    available: true,
  }));

  // Opponent lineup for the optimizer, from the projection (kind-specific
  // ratings + match counts for the confidence shrink).
  const oppCourts: OpponentCourt[] = fmt.courts.map((slot, i) => {
    const proj = base.oppProjection[i]!;
    const players = proj.players
      .map((pp) => oppRoster.find((r) => r.id === pp.id)!)
      .filter(Boolean);
    if (slot.kind === "S") {
      const p = players[0]!;
      return { kind: "S", player: ratingFor(p, "S"), matches: p.singlesMatches + p.doublesMatches };
    }
    const [a, b] = players;
    return {
      kind: "D",
      a: ratingFor(a!, "D"),
      b: ratingFor(b!, "D"),
      aMatches: a!.singlesMatches + a!.doublesMatches,
      bMatches: b!.singlesMatches + b!.doublesMatches,
    };
  });
  const opponent: OpponentLineup = { courts: oppCourts };

  // Established doubles pairs on my team (2+ matches together) get a chemistry
  // bonus so the optimizer keeps proven partnerships together.
  const partnerCounts = myTeamId ? await teamPartnerCounts(myTeamId) : new Map();
  const establishedPairs = new Set<string>();
  for (const [k, n] of partnerCounts) if (n >= 2) establishedPairs.add(k);

  let result;
  try {
    result = optimizeLineup(roster, fmt, opponent, { topN: 3, establishedPairs });
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }
  const nameById = new Map(roster.map((p) => [p.id, p.name]));
  base.evaluated = result.evaluated;
  base.lineups = result.byTeamWinProb.map((lu) => ({
    teamWin: lu.teamWinProb,
    expPoints: lu.expectedPoints,
    courts: lu.assignments.map((a) => ({
      c: `${a.slot.kind}${a.slot.index}`,
      kind: a.slot.kind,
      points: a.points,
      players: a.ourPlayerIds.map((id) => nameById.get(id) ?? "?"),
      playerIds: [...a.ourPlayerIds],
      wp: a.winProb,
      established: a.established,
    })),
  }));
  return base;
}

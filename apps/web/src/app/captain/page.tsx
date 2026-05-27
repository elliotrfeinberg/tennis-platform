"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FORMAT_ADULT_18,
  FORMAT_MIXED_5D,
  optimizeLineup,
  type MatchFormat,
  type OpponentLineup,
  type RosterPlayer,
} from "@tennis/optimizer";
import {
  TEAMS,
  currentRatingFor,
  isPlayed,
  nextTeamMatchForTeam,
  playersForTeam,
  teamById,
  teamMatchesForTeam,
  type FixturePlayer,
  type FixtureTeamMatch,
} from "@tennis/fixtures";

const FORMATS: Record<string, MatchFormat> = {
  "2S+3D": FORMAT_ADULT_18,
  "5D": FORMAT_MIXED_5D,
};

const DEFAULT_TEAM_ID = "tm-cedar";

export default function CaptainPage() {
  const [teamId, setTeamId] = useState<string>(DEFAULT_TEAM_ID);
  const [matchId, setMatchId] = useState<string | "_next">("_next");
  const [formatKey, setFormatKey] = useState<keyof typeof FORMATS>("2S+3D");
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());

  const team = teamById(teamId)!;
  const upcomingMatches = useMemo(
    () =>
      teamMatchesForTeam(teamId).filter((m) => !isPlayed(m.playedOn)),
    [teamId]
  );
  const selectedMatch: FixtureTeamMatch | undefined = useMemo(() => {
    if (matchId === "_next") return nextTeamMatchForTeam(teamId);
    return upcomingMatches.find((m) => m.id === matchId);
  }, [matchId, teamId, upcomingMatches]);

  const opponentTeam = selectedMatch
    ? teamById(
        selectedMatch.homeTeamId === teamId
          ? selectedMatch.awayTeamId
          : selectedMatch.homeTeamId
      )
    : undefined;

  const format = FORMATS[formatKey]!;

  const ourRoster = useMemo(() => playersForTeam(teamId), [teamId]);
  const oppRoster = useMemo(
    () => (opponentTeam ? playersForTeam(opponentTeam.id) : []),
    [opponentTeam]
  );

  const roster: RosterPlayer[] = useMemo(
    () =>
      ourRoster.map((p) => ({
        id: p.id,
        name: p.displayName,
        rating: currentRatingFor(p.id),
        available: !unavailable.has(p.id),
      })),
    [ourRoster, unavailable]
  );

  // Approximate opponent lineup: top players fill from the top down
  // (strongest in singles, weakest+strongest pairings in doubles — same
  // shape the generator uses, so it's a fair guess).
  const opponent: OpponentLineup = useMemo(() => {
    const sorted = [...oppRoster].sort(
      (a, b) =>
        currentRatingFor(b.id).rating - currentRatingFor(a.id).rating
    );
    const top8 = sorted.slice(0, 8);
    const singles = top8.slice(0, 2);
    const doubles = top8.slice(2, 8);
    const pairings: [FixturePlayer, FixturePlayer][] = [
      [doubles[0]!, doubles[5]!],
      [doubles[1]!, doubles[4]!],
      [doubles[2]!, doubles[3]!],
    ];
    const courts = format.courts.map((slot, i) => {
      if (slot.kind === "S") {
        const p = singles[i]!;
        return { kind: "S" as const, player: currentRatingFor(p.id) };
      }
      const pair = pairings[i - 2]!;
      return {
        kind: "D" as const,
        a: currentRatingFor(pair[0].id),
        b: currentRatingFor(pair[1].id),
      };
    });
    return { courts };
  }, [oppRoster, format]);

  const result = useMemo(() => {
    if (!opponentTeam) return { error: "No upcoming opponent" };
    try {
      return optimizeLineup(roster, format, opponent, {
        topN: 3,
        includeExpectedWinsRanking: true,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [roster, format, opponent, opponentTeam]);

  const toggle = (id: string) => {
    setUnavailable((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ourPlayerById = useMemo(
    () => Object.fromEntries(ourRoster.map((p) => [p.id, p])),
    [ourRoster]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Captain workspace</h1>
        <p className="text-sm text-stone-600">
          Pick your team, choose an upcoming match, mark unavailable players,
          and see top lineups ranked by team win probability.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <label>
          <span className="mr-2 text-stone-500">Your team:</span>
          <select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setMatchId("_next");
              setUnavailable(new Set());
            }}
            className="rounded border border-stone-300 bg-white px-2 py-1"
          >
            {TEAMS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mr-2 text-stone-500">Match:</span>
          <select
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            className="rounded border border-stone-300 bg-white px-2 py-1"
          >
            <option value="_next">Next upcoming</option>
            {upcomingMatches.map((m) => {
              const oppId =
                m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
              const opp = teamById(oppId);
              return (
                <option key={m.id} value={m.id}>
                  Week {m.week} · {m.playedOn} · {m.homeTeamId === teamId ? "vs" : "@"} {opp?.name}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          <span className="mr-2 text-stone-500">Format:</span>
          <select
            value={formatKey}
            onChange={(e) =>
              setFormatKey(e.target.value as keyof typeof FORMATS)
            }
            className="rounded border border-stone-300 bg-white px-2 py-1"
          >
            <option value="2S+3D">USTA Adult (2S + 3D)</option>
            <option value="5D">Mixed / Combo (5D)</option>
          </select>
        </label>
      </div>

      {selectedMatch && opponentTeam ? (
        <div className="rounded-lg border border-court-200 bg-court-50 px-4 py-3 text-sm">
          <strong>{team.name}</strong>{" "}
          {selectedMatch.homeTeamId === teamId ? "vs" : "@"}{" "}
          <Link
            href={`/teams/${opponentTeam.id}`}
            className="font-semibold text-court-700 hover:underline"
          >
            {opponentTeam.name}
          </Link>{" "}
          · Week {selectedMatch.week} · {selectedMatch.playedOn}
        </div>
      ) : (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          No upcoming matches scheduled for this team.
        </p>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <RosterPanel
          title={`${team.name} — your roster`}
          players={ourRoster}
          unavailable={unavailable}
          onToggle={toggle}
        />
        {opponentTeam && (
          <RosterPanel
            title={`${opponentTeam.name} — projected lineup`}
            players={oppRoster}
            unavailable={new Set()}
            onToggle={() => undefined}
            readOnly
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Top 3 lineups by team win probability
        </h2>
        {"error" in result ? (
          <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {result.error}
          </p>
        ) : (
          <div className="space-y-4">
            {result.byTeamWinProb.map((lineup, i) => (
              <LineupCard
                key={i}
                rank={i + 1}
                lineup={lineup}
                rosterById={ourPlayerById}
              />
            ))}
            <p className="text-xs text-stone-500">
              Evaluated {result.evaluated.toLocaleString()} possible lineups.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function RosterPanel({
  title,
  players,
  unavailable,
  onToggle,
  readOnly,
}: {
  title: string;
  players: FixturePlayer[];
  unavailable: Set<string>;
  onToggle: (id: string) => void;
  readOnly?: boolean;
}) {
  const sorted = [...players].sort(
    (a, b) => currentRatingFor(b.id).rating - currentRatingFor(a.id).rating
  );
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="mb-2 font-medium">{title}</h3>
      <ul className="divide-y divide-stone-100">
        {sorted.map((p) => {
          const out = unavailable.has(p.id);
          const r = currentRatingFor(p.id);
          return (
            <li
              key={p.id}
              className="flex items-center justify-between py-1.5"
            >
              <span className={out ? "text-stone-400 line-through" : ""}>
                {p.displayName}
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono">{Math.round(r.rating)}</span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">
                  {p.publishedNtrp.toFixed(1)}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => onToggle(p.id)}
                    className="rounded border border-stone-300 px-2 py-0.5 hover:bg-stone-50"
                  >
                    {out ? "Available" : "Out"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LineupCard({
  rank,
  lineup,
  rosterById,
}: {
  rank: number;
  lineup: ReturnType<typeof optimizeLineup>["byTeamWinProb"][number];
  rosterById: Record<string, FixturePlayer>;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-medium">Lineup #{rank}</h3>
        <div className="flex gap-4 text-sm">
          <span>
            <span className="text-stone-500">Team win:</span>{" "}
            <span className="font-mono font-semibold">
              {(lineup.teamWinProb * 100).toFixed(0)}%
            </span>
          </span>
          <span>
            <span className="text-stone-500">Expected wins:</span>{" "}
            <span className="font-mono">
              {lineup.expectedWins.toFixed(2)} / {lineup.assignments.length}
            </span>
          </span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
            <th className="py-1">Court</th>
            <th>Players</th>
            <th className="text-right">Win prob</th>
          </tr>
        </thead>
        <tbody>
          {lineup.assignments.map((a, i) => (
            <tr key={i} className="border-t border-stone-100">
              <td className="py-1.5 font-mono text-xs">
                {a.slot.kind === "S" ? "S" : "D"}
                {a.slot.index}
              </td>
              <td>
                {a.ourPlayerIds
                  .map((id) => rosterById[id]?.displayName ?? id)
                  .join(" + ")}
              </td>
              <td className="text-right font-mono">
                {(a.winProb * 100).toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

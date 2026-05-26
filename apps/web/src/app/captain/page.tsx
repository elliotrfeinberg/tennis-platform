"use client";

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
  SAMPLE_OPP_ROSTER,
  SAMPLE_OUR_ROSTER,
  toRosterPlayer,
  type SeedPlayer,
} from "@/lib/sampleData";

const FORMATS: Record<string, MatchFormat> = {
  "2S+3D": FORMAT_ADULT_18,
  "5D": FORMAT_MIXED_5D,
};

export default function CaptainPage() {
  const [formatKey, setFormatKey] = useState<keyof typeof FORMATS>("2S+3D");
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());

  const format = FORMATS[formatKey]!;

  const roster: RosterPlayer[] = useMemo(
    () =>
      SAMPLE_OUR_ROSTER.map((p) => ({
        ...toRosterPlayer(p),
        available: !unavailable.has(p.id),
      })),
    [unavailable]
  );

  const opponent: OpponentLineup = useMemo(() => {
    // Fill courts in roster order — captain doesn't always know opp lineup
    // exactly; this approximates "opponent will probably play their top
    // available players on top lines".
    const opp = [...SAMPLE_OPP_ROSTER];
    const courts = format.courts.map((slot) => {
      if (slot.kind === "S") {
        const p = opp.shift()!;
        return { kind: "S" as const, player: toRosterPlayer(p).rating };
      }
      const a = opp.shift()!;
      const b = opp.shift()!;
      return {
        kind: "D" as const,
        a: toRosterPlayer(a).rating,
        b: toRosterPlayer(b).rating,
      };
    });
    return { courts };
  }, [format]);

  const result = useMemo(() => {
    try {
      return optimizeLineup(roster, format, opponent, {
        topN: 3,
        includeExpectedWinsRanking: true,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [roster, format, opponent]);

  const toggle = (id: string) => {
    setUnavailable((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Captain workspace</h1>
        <p className="text-sm text-stone-600">
          Pick a format, mark unavailable players, see top lineups ranked by
          team win probability. Sample roster — wire to real teams in v1.
        </p>
      </div>

      <div className="flex gap-3">
        <label className="text-sm">
          <span className="mr-2">Format:</span>
          <select
            value={formatKey}
            onChange={(e) =>
              setFormatKey(e.target.value as keyof typeof FORMATS)
            }
            className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
          >
            <option value="2S+3D">USTA Adult (2S + 3D)</option>
            <option value="5D">Mixed / Combo (5D)</option>
          </select>
        </label>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <RosterPanel
          title="Your roster"
          players={SAMPLE_OUR_ROSTER}
          unavailable={unavailable}
          onToggle={toggle}
        />
        <RosterPanel
          title="Opponent (sample)"
          players={SAMPLE_OPP_ROSTER}
          unavailable={new Set()}
          onToggle={() => undefined}
          readOnly
        />
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
                rosterById={Object.fromEntries(
                  SAMPLE_OUR_ROSTER.map((p) => [p.id, p])
                )}
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
  players: SeedPlayer[];
  unavailable: Set<string>;
  onToggle: (id: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="mb-2 font-medium">{title}</h3>
      <ul className="divide-y divide-stone-100">
        {players.map((p) => {
          const out = unavailable.has(p.id);
          return (
            <li key={p.id} className="flex items-center justify-between py-1.5">
              <span className={out ? "text-stone-400 line-through" : ""}>
                {p.name}
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono">{p.glicko}</span>
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
  rosterById: Record<string, SeedPlayer>;
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
                  .map((id) => rosterById[id]?.name ?? id)
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

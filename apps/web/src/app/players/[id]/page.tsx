// Player detail — real crawl data with full match log + rating sparkline.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkline } from "@/components/Sparkline";
import {
  findPlayerBySlug,
  playerSlug,
  type PerfMatchEntry,
} from "@/lib/perfRatings";

function formatScore(sets: PerfMatchEntry["sets"]): string {
  return sets
    .map((s) => `${s.playerGames}-${s.opponentGames}`)
    .join(", ");
}

function bandMidpoint(label: number | undefined): number | null {
  if (label === undefined) return null;
  return label - 0.25;
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await findPlayerBySlug(id);
  if (!player) notFound();

  const history = player.history; // chronological
  const last = history[history.length - 1];
  const first = history[0];
  const ratingDelta = first && last
    ? last.playerPostRating - first.playerPreRating
    : 0;
  const ratingDeltaSign = ratingDelta >= 0 ? "+" : "";

  const midpoint = bandMidpoint(player.ntrpLabel);

  const sparkData = history.map((m) => ({
    x: new Date(m.date).getTime(),
    y: m.playerPostRating,
    label: `${m.date} → ${m.playerPostRating.toFixed(2)} (${
      m.won ? "W" : "L"
    } ${formatScore(m.sets)})`,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/players" className="text-xs text-stone-500 hover:underline">
          ← Back to players
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{player.name ?? "(no name)"}</h1>
        <p className="text-sm text-stone-600">
          {player.teams.length > 0 ? player.teams.join(" · ") : "no team"}
          {player.memberId && (
            <>
              {" · "}
              <span className="font-mono text-xs text-stone-400">
                USTA #{player.memberId}
              </span>
            </>
          )}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Roster band"
          value={
            player.ntrpLabel !== undefined ? player.ntrpLabel.toFixed(1) : "—"
          }
          sub={
            midpoint !== null
              ? `midpoint ${midpoint.toFixed(2)}`
              : "unrated"
          }
        />
        <Stat
          label="Current perf rating"
          value={player.perfRating.toFixed(3)}
          sub={
            midpoint !== null
              ? `${(player.perfRating - midpoint).toFixed(2)} vs midpoint`
              : ""
          }
        />
        <Stat
          label="Matches played"
          value={String(player.matches)}
          sub={
            history.length > 0
              ? `${ratingDeltaSign}${ratingDelta.toFixed(2)} since first match`
              : ""
          }
        />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-stone-700">Rating over time</h2>
          <span className="text-xs text-stone-400">
            {history.length > 0
              ? `${history[0]!.date} → ${history[history.length - 1]!.date}`
              : "no data"}
          </span>
        </div>
        <Sparkline
          data={sparkData}
          width={640}
          height={120}
          yRefs={
            midpoint !== null
              ? [
                  {
                    y: midpoint,
                    color: "#d6d3d1",
                    label: `band midpoint ${midpoint.toFixed(2)}`,
                  },
                ]
              : []
          }
          ariaLabel={`${player.name} rating history`}
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <h2 className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700">
          Match log ({history.length})
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Court</th>
              <th className="px-3 py-2">Opponent(s)</th>
              <th className="px-3 py-2 text-right">Pre rating</th>
              <th className="px-3 py-2 text-right">Opp rating</th>
              <th className="px-3 py-2">W/L · Score</th>
              <th className="px-3 py-2 text-right">Match rating</th>
              <th className="px-3 py-2 text-right">Overall</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((m, i) => {
              const oppNames = m.opponents.map((o) => o.name).join(" / ");
              return (
                <tr key={i} className="border-t border-stone-100 align-top">
                  <td className="px-3 py-2 font-mono text-xs text-stone-600">
                    {m.date}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-medium">
                      {m.kind === "S" ? "S" : "D"}
                      {m.line}
                    </span>
                    {m.partners.length > 0 && (
                      <div className="text-stone-500">
                        w/{" "}
                        <Link
                          href={`/players/${playerSlug(m.partners[0]!.key)}` as `/players/${string}`}
                          className="hover:underline"
                        >
                          {m.partners[0]!.name}
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      {m.opponents.map((o) => (
                        <div key={o.key}>
                          <Link
                            href={`/players/${playerSlug(o.key)}` as `/players/${string}`}
                            className="text-court-700 hover:underline"
                          >
                            {o.name}
                          </Link>{" "}
                          <span className="font-mono text-xs text-stone-400">
                            ({o.preRating.toFixed(2)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-stone-600">
                    {m.playerPreRating.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-stone-600">
                    {m.opponentMean.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`mr-1 inline-block w-4 text-center font-semibold ${
                        m.won ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {m.won ? "W" : "L"}
                    </span>
                    <span className="font-mono text-xs text-stone-600">
                      {formatScore(m.sets)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {m.perf.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-stone-700">
                    {m.playerPostRating.toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {history.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-stone-400">
                  No matches in the crawled data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-stone-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold text-stone-900">{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

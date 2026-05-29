// Player detail — real crawl data with full match log + rating sparkline.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkline } from "@/components/Sparkline";
import {
  findPlayerBySlug,
  playerSlug,
  type PerfMatchEntry,
  type PerfRatingEntry,
} from "@/lib/perfRatings";

function formatScore(sets: PerfMatchEntry["sets"]): string {
  return sets
    .map((s) => `${s.playerGames}-${s.opponentGames}`)
    .join(", ");
}

// NTRP band edges. Band 3.5 covers (3.0001, 3.5000] — so for display
// purposes we treat 3.0 as the LOWER edge and 3.5 as the UPPER edge.
function bandEdges(
  label: number | undefined
): { low: number; high: number } | null {
  if (label === undefined) return null;
  return { low: label - 0.5, high: label };
}

// Which rating stream should drive the sparkline + post-rating display?
// Adult if present, otherwise mixed.
function displayStream(player: PerfRatingEntry): "adult" | "mixed" | null {
  if (player.adultRating !== null) return "adult";
  if (player.mixedRating !== null) return "mixed";
  return null;
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
  const stream = displayStream(player);

  // Filter history to just the display stream for sparkline.
  const sparkHistory = stream
    ? history.filter((m) => m.category === stream)
    : [];

  const last = sparkHistory[sparkHistory.length - 1];
  const first = sparkHistory[0];
  const ratingDelta =
    first && last ? last.playerPostRating - first.playerPreRating : 0;
  const ratingDeltaSign = ratingDelta >= 0 ? "+" : "";

  const edges = bandEdges(player.ntrpLabel);

  const sparkData = sparkHistory.map((m) => ({
    x: new Date(m.date).getTime(),
    y: m.playerPostRating,
    label: `${m.date} → ${m.playerPostRating.toFixed(2)} (${
      m.won ? "W" : "L"
    } ${formatScore(m.sets)})`,
  }));

  const totalMatches = player.adultMatches + player.mixedMatches + player.otherMatches;

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

      <section className="grid gap-4 md:grid-cols-4">
        <Stat
          label="Roster band"
          value={
            player.ntrpLabel !== undefined ? player.ntrpLabel.toFixed(1) : "—"
          }
          sub={
            edges
              ? `${edges.low.toFixed(1)} – ${edges.high.toFixed(1)}`
              : "unrated"
          }
        />
        <Stat
          label="Adult rating"
          value={player.adultRating !== null ? player.adultRating.toFixed(3) : "—"}
          sub={
            player.adultMatches > 0
              ? `${player.adultMatches} adult match${player.adultMatches !== 1 ? "es" : ""}`
              : "no adult matches"
          }
        />
        <Stat
          label="Mixed rating"
          value={player.mixedRating !== null ? player.mixedRating.toFixed(3) : "—"}
          sub={
            player.mixedMatches > 0
              ? `${player.mixedMatches} mixed match${player.mixedMatches !== 1 ? "es" : ""}`
              : "no mixed matches"
          }
        />
        <Stat
          label="Total matches"
          value={String(totalMatches)}
          sub={
            sparkHistory.length > 0
              ? `${ratingDeltaSign}${ratingDelta.toFixed(2)} since first ${stream ?? ""} match`
              : ""
          }
        />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-stone-700">
            {stream === "adult"
              ? "Adult rating over time"
              : stream === "mixed"
              ? "Mixed rating over time"
              : "Rating over time"}
          </h2>
          <span className="text-xs text-stone-400">
            {sparkHistory.length > 0
              ? `${sparkHistory[0]!.date} → ${sparkHistory[sparkHistory.length - 1]!.date}`
              : "no data"}
          </span>
        </div>
        {sparkHistory.length > 0 ? (
          <Sparkline
            data={sparkData}
            width={640}
            height={120}
            yRefs={
              edges
                ? [
                    {
                      y: edges.low,
                      color: "#d6d3d1",
                      label: `band ${edges.low.toFixed(1)}`,
                    },
                    {
                      y: edges.high,
                      color: "#d6d3d1",
                      label: `band ${edges.high.toFixed(1)}`,
                    },
                  ]
                : []
            }
            ariaLabel={`${player.name} rating history`}
          />
        ) : (
          <div className="flex h-[120px] items-center justify-center text-sm text-stone-400">
            No matches in the displayed rating stream.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <h2 className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700">
          Match log ({history.length})
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Cat</th>
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
              const isCombo = !m.affectsRating;
              return (
                <tr
                  key={i}
                  className={`border-t border-stone-100 align-top ${isCombo ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2">
                    <CategoryBadge category={m.category} />
                  </td>
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
                        </Link>{" "}
                        <span className="font-mono text-stone-400">
                          ({m.partners[0]!.preRating.toFixed(2)})
                        </span>
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
                    {isCombo && (
                      <span className="ml-1 text-xs text-stone-400">shadow</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${isCombo ? "italic text-stone-400" : "text-stone-700"}`}
                  >
                    {m.affectsRating ? m.playerPostRating.toFixed(2) : "—"}
                  </td>
                </tr>
              );
            })}
            {history.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-stone-400">
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

function CategoryBadge({ category }: { category: PerfMatchEntry["category"] }) {
  if (category === "adult") {
    return (
      <span className="inline-block rounded px-1 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
        A
      </span>
    );
  }
  if (category === "mixed") {
    return (
      <span className="inline-block rounded px-1 py-0.5 text-xs font-medium bg-purple-100 text-purple-700">
        M
      </span>
    );
  }
  return (
    <span className="inline-block rounded px-1 py-0.5 text-xs font-medium bg-stone-100 text-stone-500">
      C
    </span>
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

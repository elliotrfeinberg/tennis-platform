// Player detail — backed by Postgres. Per-season published NTRP bands plus
// the computed perf rating, a rating-over-time sparkline, and the full match
// log (opponents + scores) from perf_match_results.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkline } from "@/components/Sparkline";
import {
  findPlayer,
  ratingTypeLabel,
  type MatchLogEntry,
} from "@/lib/players";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US");
}

function formatScore(sets: MatchLogEntry["sets"]): string {
  if (sets.length === 0) return "—";
  return sets.map((s) => `${s.player}-${s.opponent}`).join(", ");
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await findPlayer(id);
  if (!player) notFound();

  const bands = player.bands;
  const latest = bands.length > 0 ? bands[bands.length - 1]! : undefined;
  const perf = player.perfFull;

  // Sparkline of rating over time (only rating-affecting matches).
  const spark = player.matchLog
    .filter((m) => m.affectsRating && m.postRating !== null && m.playedOn)
    .map((m) => ({
      x: new Date(m.playedOn!).getTime(),
      y: m.postRating!,
      label: `${fmtDate(m.playedOn)} → ${m.postRating!.toFixed(2)} (${
        m.won ? "W" : "L"
      } ${formatScore(m.sets)})`,
    }));
  const edges =
    player.latestNtrp != null
      ? { low: player.latestNtrp - 0.5, high: player.latestNtrp }
      : null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/players" className="text-xs text-stone-500 hover:underline">
          ← Back to players
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{player.name}</h1>
        <p className="text-sm text-stone-600">
          {player.gender ?? "—"}
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
          label="Latest roster band"
          value={latest && latest.ntrp !== null ? latest.ntrp.toFixed(1) : "—"}
          sub={
            latest ? `${latest.year} · ${ratingTypeLabel(latest.ratingType)}` : ""
          }
        />
        <Stat
          label="Perf rating"
          value={perf?.display != null ? perf.display.toFixed(2) : "—"}
          sub="NTRP scale"
        />
        <Stat
          label="Adult / Mixed"
          value={`${perf?.adult != null ? perf.adult.toFixed(2) : "—"} / ${
            perf?.mixed != null ? perf.mixed.toFixed(2) : "—"
          }`}
          sub={
            perf
              ? `${perf.adultMatches}A · ${perf.mixedMatches}M`
              : ""
          }
        />
        <Stat
          label="Matches"
          value={String(
            (perf?.adultMatches ?? 0) +
              (perf?.mixedMatches ?? 0) +
              (perf?.otherMatches ?? 0)
          )}
          sub={player.matchLog.length ? `${player.matchLog.length} courts` : ""}
        />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-stone-700">
            Perf rating over time
          </h2>
          <span className="text-xs text-stone-400">
            {spark.length > 0
              ? `${fmtDate(player.matchLog[0]!.playedOn)} → ${fmtDate(
                  player.matchLog[player.matchLog.length - 1]!.playedOn
                )}`
              : "no rated matches"}
          </span>
        </div>
        {spark.length > 0 ? (
          <Sparkline
            data={spark}
            width={640}
            height={120}
            yRefs={
              edges
                ? [
                    { y: edges.low, color: "#d6d3d1", label: edges.low.toFixed(1) },
                    {
                      y: edges.high,
                      color: "#d6d3d1",
                      label: edges.high.toFixed(1),
                    },
                  ]
                : []
            }
            ariaLabel={`${player.name} perf rating history`}
          />
        ) : (
          <div className="flex h-[120px] items-center justify-center text-sm text-stone-400">
            No rated matches yet.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <h2 className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700">
          Match log ({player.matchLog.length})
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Cat</th>
              <th className="px-3 py-2">Court</th>
              <th className="px-3 py-2">Partner</th>
              <th className="px-3 py-2">Opponent(s)</th>
              <th className="px-3 py-2">W/L · Score</th>
              <th className="px-3 py-2 text-right">Opp</th>
              <th className="px-3 py-2 text-right">Perf</th>
              <th className="px-3 py-2 text-right">Rating</th>
            </tr>
          </thead>
          <tbody>
            {[...player.matchLog].reverse().map((m, i) => (
              <tr
                key={i}
                className={`border-t border-stone-100 align-top ${
                  m.affectsRating ? "" : "opacity-60"
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs text-stone-600">
                  {fmtDate(m.playedOn)}
                </td>
                <td className="px-3 py-2">
                  <CategoryBadge category={m.category} />
                </td>
                <td className="px-3 py-2 text-xs font-medium">
                  {m.kind}
                  {m.line}
                </td>
                <td className="px-3 py-2 text-xs">
                  {m.partners.length === 0
                    ? "—"
                    : m.partners.map((p, j) => (
                        <span key={j}>
                          {j > 0 && " / "}
                          {p.name}
                          {p.rating != null && (
                            <span className="ml-1 font-mono text-stone-400">
                              ({p.rating.toFixed(2)})
                            </span>
                          )}
                        </span>
                      ))}
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>
                    {m.opponents.length === 0
                      ? "—"
                      : m.opponents.map((o, j) => (
                          <span key={j}>
                            {j > 0 && " / "}
                            {o.name}
                            {o.rating != null && (
                              <span className="ml-1 font-mono text-stone-400">
                                ({o.rating.toFixed(2)})
                              </span>
                            )}
                          </span>
                        ))}
                  </div>
                  {m.opponentTeam && (
                    <div className="text-stone-400">{m.opponentTeam}</div>
                  )}
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
                <td className="px-3 py-2 text-right font-mono text-xs text-stone-500">
                  {m.opponentRating != null ? m.opponentRating.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {m.perf.toFixed(2)}
                  {!m.affectsRating && (
                    <span className="ml-1 text-xs text-stone-400">shadow</span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    m.affectsRating ? "text-stone-700" : "italic text-stone-400"
                  }`}
                >
                  {m.affectsRating && m.postRating != null
                    ? m.postRating.toFixed(2)
                    : "—"}
                </td>
              </tr>
            ))}
            {player.matchLog.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-stone-400">
                  No matches ingested for this player yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <h2 className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700">
          Published NTRP by season
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Season</th>
              <th className="px-3 py-2 text-right">NTRP band</th>
              <th className="px-3 py-2">Rating type</th>
              <th className="px-3 py-2">Rating date</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.year} className="border-t border-stone-100">
                <td className="px-3 py-2 font-medium">{b.year}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {b.ntrp !== null ? b.ntrp.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-stone-600">
                  {ratingTypeLabel(b.ratingType)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-stone-500">
                  {fmtDate(b.ratingDate)}
                </td>
              </tr>
            ))}
            {bands.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-stone-400">
                  No published ratings on record.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
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

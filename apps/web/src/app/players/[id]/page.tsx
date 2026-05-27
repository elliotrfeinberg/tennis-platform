import Link from "next/link";
import { notFound } from "next/navigation";
import {
  estimatedNtrpFor,
  estimatedNtrpRdFor,
  FIXTURE_CALIBRATION,
  matchesForPlayer,
  playerById,
  ratingHistoryForPlayer,
  teamById,
  type PlayerMatchView,
} from "@tennis/fixtures";
import { glickoToNtrp } from "@tennis/ratings";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = playerById(id);
  if (!player) notFound();
  const team = teamById(player.teamId);
  const history = ratingHistoryForPlayer(id);
  const matches = matchesForPlayer(id);

  const currentNtrp = estimatedNtrpFor(id);
  const currentNtrpRd = estimatedNtrpRdFor(id);
  const initialNtrp = glickoToNtrp(
    player.initialRating.rating,
    FIXTURE_CALIBRATION
  );
  const ntrpDelta = currentNtrp - initialNtrp;
  const ntrpDeltaSign = ntrpDelta >= 0 ? "+" : "";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/players" className="text-xs text-stone-500 hover:underline">
          ← Back to players
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{player.displayName}</h1>
        <p className="text-sm text-stone-600">
          {team ? (
            <Link href={`/teams/${team.id}`} className="hover:underline">
              {team.name}
            </Link>
          ) : (
            "Free agent"
          )}{" "}
          · {player.district}, {player.section}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Published NTRP"
          value={player.publishedNtrp.toFixed(1)}
          sub="Year-end rating"
        />
        <Stat
          label="Est. NTRP"
          value={currentNtrp.toFixed(4)}
          sub={`±${currentNtrpRd.toFixed(2)} · ${ntrpDeltaSign}${ntrpDelta.toFixed(4)} this season`}
        />
        <Stat
          label="Season record"
          value={`${matches.filter((m) => m.won).length}–${matches.filter((m) => !m.won).length}`}
          sub={`${matches.length} courts played`}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Est. NTRP history</h2>
        <RatingSparkline
          points={history.map((h) =>
            glickoToNtrp(h.rating.rating, FIXTURE_CALIBRATION)
          )}
          dates={history.map((h) => h.computedAt)}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Match log</h2>
        {matches.length === 0 ? (
          <p className="rounded border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            No matches played yet this season.
          </p>
        ) : (
          <MatchLog matches={matches} viewerId={id} />
        )}
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
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-stone-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-mono font-semibold">{value}</div>
      <div className="text-xs text-stone-500">{sub}</div>
    </div>
  );
}

function RatingSparkline({
  points,
  dates,
}: {
  points: number[];
  dates: string[];
}) {
  if (points.length === 0) return null;
  const width = 600;
  const height = 140;
  const padX = 24;
  const padY = 16;
  const min = Math.min(...points);
  const max = Math.max(...points);
  // Range is in NTRP units now (~3.8 to ~4.2). Ensure at least 0.1 so flat
  // lines don't collapse into a single y-pixel.
  const range = Math.max(0.1, max - min);
  const xs = points.map(
    (_, i) => padX + (i * (width - 2 * padX)) / Math.max(1, points.length - 1)
  );
  const ys = points.map(
    (p) => padY + ((max - p) / range) * (height - 2 * padY)
  );
  const path = points
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]!.toFixed(1)} ${ys[i]!.toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-36 w-full"
        preserveAspectRatio="none"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          className="text-court-700"
          strokeWidth={2}
        />
        {points.map((_, i) => (
          <circle
            key={i}
            cx={xs[i]}
            cy={ys[i]}
            r={2.5}
            className="fill-court-700"
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-stone-500">
        <span>{dates[0]}</span>
        <span className="font-mono">
          {min.toFixed(4)} → {max.toFixed(4)}
        </span>
        <span>{dates[dates.length - 1]}</span>
      </div>
    </div>
  );
}

function MatchLog({
  matches,
  viewerId,
}: {
  matches: PlayerMatchView[];
  viewerId: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Court</th>
            <th className="px-3 py-2">With</th>
            <th className="px-3 py-2">Vs</th>
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2 text-right">Result</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const partner = m.partnerIds[0]
              ? playerById(m.partnerIds[0])?.displayName
              : null;
            const oppNames = m.opponentIds
              .map((id) => playerById(id)?.displayName ?? id)
              .join(" / ");
            const scoreStr = m.court.sets
              .map((s) => {
                const me = m.wasHome ? s.home : s.away;
                const them = m.wasHome ? s.away : s.home;
                return `${me}-${them}`;
              })
              .join(", ");
            return (
              <tr key={m.court.id} className="border-t border-stone-100">
                <td className="px-3 py-2 text-stone-600">
                  {m.teamMatch.playedOn}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {m.court.courtKind}
                  {m.court.line}
                </td>
                <td className="px-3 py-2 text-stone-600">{partner ?? "—"}</td>
                <td className="px-3 py-2 text-stone-600">{oppNames}</td>
                <td className="px-3 py-2 font-mono">{scoreStr}</td>
                <td
                  className={`px-3 py-2 text-right font-semibold ${m.won ? "text-emerald-700" : "text-rose-600"}`}
                >
                  {m.won ? "W" : "L"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

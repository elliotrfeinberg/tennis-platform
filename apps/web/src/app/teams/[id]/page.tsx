import Link from "next/link";
import { notFound } from "next/navigation";
import {
  currentRatingFor,
  isPlayed,
  playerById,
  playersForTeam,
  teamById,
  teamMatchesForTeam,
} from "@tennis/fixtures";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const team = teamById(id);
  if (!team) notFound();
  const roster = playersForTeam(id).sort((a, b) => {
    const ra = currentRatingFor(a.id).rating;
    const rb = currentRatingFor(b.id).rating;
    return rb - ra;
  });
  const allMatches = teamMatchesForTeam(id);
  const played = allMatches.filter((m) => isPlayed(m.playedOn));
  const upcoming = allMatches.filter((m) => !isPlayed(m.playedOn));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/teams" className="text-xs text-stone-500 hover:underline">
          ← Back to standings
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{team.name}</h1>
        <p className="text-sm text-stone-600">
          {team.league} · {team.section} · {team.season} · Home:{" "}
          {team.homeFacility}
        </p>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white">
          <header className="border-b border-stone-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            Roster
          </header>
          <ul className="divide-y divide-stone-100">
            {roster.map((p) => {
              const r = currentRatingFor(p.id);
              const captain = team.captainPlayerId === p.id;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <div>
                    <Link
                      href={`/players/${p.id}`}
                      className="font-medium text-court-700 hover:underline"
                    >
                      {p.displayName}
                    </Link>
                    {captain && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        captain
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">
                      {p.publishedNtrp.toFixed(1)}
                    </span>
                    <span className="font-mono">
                      {Math.round(r.rating)}
                      <span className="text-stone-400">
                        ±{Math.round(r.rd)}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <ScheduleBlock
            title="Recent results"
            matches={played}
            teamId={id}
          />
          <ScheduleBlock
            title="Upcoming"
            matches={upcoming}
            teamId={id}
          />
        </div>
      </section>
    </div>
  );
}

function ScheduleBlock({
  title,
  matches,
  teamId,
}: {
  title: string;
  matches: ReturnType<typeof teamMatchesForTeam>;
  teamId: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      <header className="border-b border-stone-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-stone-500">
        {title}
      </header>
      {matches.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-stone-400">
          Nothing here.
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 text-sm">
          {matches.map((m) => {
            const isHome = m.homeTeamId === teamId;
            const oppId = isHome ? m.awayTeamId : m.homeTeamId;
            const opp = teamById(oppId);
            let resultLabel: string | null = null;
            let won = false;
            if (m.courts) {
              const courtsWon = m.courts.filter((c) =>
                isHome ? c.homeWon : !c.homeWon
              ).length;
              const courtsLost = m.courts.length - courtsWon;
              resultLabel = `${courtsWon}-${courtsLost}`;
              won = courtsWon > courtsLost;
            }
            return (
              <li
                key={m.id}
                className="flex items-center justify-between px-4 py-2"
              >
                <div>
                  <div className="text-xs text-stone-500">
                    Week {m.week} · {m.playedOn}
                  </div>
                  <div>
                    {isHome ? "vs " : "@ "}
                    <Link
                      href={`/teams/${oppId}`}
                      className="font-medium hover:underline"
                    >
                      {opp?.name}
                    </Link>
                  </div>
                </div>
                {resultLabel ? (
                  <span
                    className={`font-mono text-sm font-semibold ${won ? "text-emerald-700" : "text-rose-600"}`}
                  >
                    {won ? "W" : "L"} {resultLabel}
                  </span>
                ) : (
                  <Link
                    href={`/captain?teamId=${teamId}&matchId=${m.id}`}
                    className="text-xs text-court-700 hover:underline"
                  >
                    Plan lineup →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

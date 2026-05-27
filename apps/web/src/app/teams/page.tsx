import Link from "next/link";
import { LEAGUE, standingsForLeague } from "@tennis/fixtures";

export default function TeamsPage() {
  const standings = standingsForLeague();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Standings</h1>
        <p className="text-sm text-stone-600">
          {LEAGUE.name} · {LEAGUE.section} · {LEAGUE.season}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2 text-right">W</th>
              <th className="px-3 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">Courts W</th>
              <th className="px-3 py-2 text-right">Courts L</th>
              <th className="px-3 py-2 text-right">Court diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const diff = s.courtsWon - s.courtsLost;
              return (
                <tr key={s.team.id} className="border-t border-stone-100">
                  <td className="px-3 py-2 font-mono text-stone-500">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/teams/${s.team.id}`}
                      className="font-medium text-court-700 hover:underline"
                    >
                      {s.team.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {s.teamMatchWins}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {s.teamMatchLosses}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {s.courtsWon}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {s.courtsLost}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-600" : "text-stone-500"}`}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

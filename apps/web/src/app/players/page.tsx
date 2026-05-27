import Link from "next/link";
import {
  estimatedNtrpFor,
  estimatedNtrpRdFor,
  searchPlayers,
  teamById,
} from "@tennis/fixtures";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const results = searchPlayers(query, 60);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Players</h1>
        <p className="text-sm text-stone-600">
          Search the fixture league. Click a player to see rating history and
          match log.
        </p>
      </div>

      <form className="flex gap-2" action="/players">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name…"
          className="flex-1 rounded border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-court-700 px-4 py-2 text-sm font-medium text-white hover:bg-court-900"
        >
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2 text-right">Published NTRP</th>
              <th className="px-3 py-2 text-right">Est. NTRP</th>
            </tr>
          </thead>
          <tbody>
            {results.map((p) => {
              const team = teamById(p.teamId);
              const estNtrp = estimatedNtrpFor(p.id);
              const estRd = estimatedNtrpRdFor(p.id);
              return (
                <tr key={p.id} className="border-t border-stone-100">
                  <td className="px-3 py-2">
                    <Link
                      href={`/players/${p.id}`}
                      className="font-medium text-court-700 hover:underline"
                    >
                      {p.displayName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-stone-600">{team?.name}</td>
                  <td className="px-3 py-2 text-stone-500">{p.section}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {p.publishedNtrp.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {estNtrp.toFixed(4)}
                    <span className="ml-1 text-xs text-stone-400">
                      ±{estRd.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-stone-400"
                >
                  No players match "{query}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

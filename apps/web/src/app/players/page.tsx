// Players list — backed by the perf-ratings JSON (real crawl data).
//
// Replaces the earlier fixture-based listing. Each row links to a
// player detail page (rating sparkline + full match log).

import Link from "next/link";
import {
  loadPerfRatings,
  playerSlug,
  type PerfRatingEntry,
} from "@/lib/perfRatings";

type SortKey = "perf" | "name" | "matches" | "delta";

function parseParams(p: { sort?: string; q?: string; band?: string }) {
  const sort: SortKey =
    p.sort === "name" || p.sort === "matches" || p.sort === "delta"
      ? p.sort
      : "perf";
  const q = (p.q ?? "").trim().toLowerCase();
  const band = p.band?.trim() ?? "";
  return { sort, q, band };
}

function filterAndSort(
  entries: PerfRatingEntry[],
  q: string,
  band: string,
  sort: SortKey
): PerfRatingEntry[] {
  const filtered = entries.filter((e) => {
    if (q && !(e.name ?? "").toLowerCase().includes(q)) return false;
    if (band) {
      if (e.ntrpLabel === undefined) return false;
      if (String(e.ntrpLabel) !== band) return false;
    }
    return true;
  });
  if (sort === "perf") filtered.sort((a, b) => b.perfRating - a.perfRating);
  else if (sort === "matches") filtered.sort((a, b) => b.matches - a.matches);
  else if (sort === "delta") {
    const d = (e: PerfRatingEntry) =>
      e.ntrpLabel === undefined ? -Infinity : e.perfRating - (e.ntrpLabel - 0.25);
    filtered.sort((a, b) => d(b) - d(a));
  } else {
    filtered.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }
  return filtered;
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string; band?: string }>;
}) {
  const params = await searchParams;
  const { sort, q, band } = parseParams(params);

  let data;
  let loadError: string | undefined;
  try {
    data = await loadPerfRatings();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Players</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">No perf-ratings JSON found.</p>
          <p className="mt-2">
            Run{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
              pnpm dev ratings fit ... --model perf
            </code>{" "}
            in <code>apps/worker</code>, then refresh.
          </p>
          {loadError && <p className="mt-2 text-xs text-amber-700">{loadError}</p>}
        </div>
      </div>
    );
  }

  const sorted = filterAndSort(data.entries, q, band, sort);

  const bandCounts = new Map<number, number>();
  for (const e of data.entries) {
    if (e.ntrpLabel === undefined) continue;
    bandCounts.set(e.ntrpLabel, (bandCounts.get(e.ntrpLabel) ?? 0) + 1);
  }
  const bandsSorted = [...bandCounts.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Players</h1>
        <p className="text-sm text-stone-600">
          {data.entries.length} players from the real crawl. USTA-style
          performance ratings on the NTRP scale. Click a name to see their
          rating history and match log.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
        action="/players"
      >
        <label className="flex flex-col text-xs text-stone-600">
          Name contains
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="search by name…"
            className="mt-1 w-56 rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs text-stone-600">
          Sort by
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 w-44 rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="perf">Perf rating (high → low)</option>
            <option value="delta">Δ vs band midpoint</option>
            <option value="matches">Match count</option>
            <option value="name">Name (A → Z)</option>
          </select>
        </label>
        <div className="flex flex-col text-xs text-stone-600">
          Band filter
          <div className="mt-1 flex flex-wrap gap-1">
            <BandChip currentBand={band} value="" label="all" />
            {bandsSorted.map(([lvl, n]) => (
              <BandChip
                key={lvl}
                currentBand={band}
                value={String(lvl)}
                label={`${lvl} (${n})`}
              />
            ))}
          </div>
        </div>
        <button
          type="submit"
          className="rounded bg-court-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-court-900"
        >
          Apply
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Teams</th>
              <th className="px-3 py-2 text-right">Roster band</th>
              <th className="px-3 py-2 text-right">Perf NTRP</th>
              <th className="px-3 py-2 text-right">Δ vs mid</th>
              <th className="px-3 py-2 text-right">Matches</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const midpoint =
                p.ntrpLabel !== undefined ? p.ntrpLabel - 0.25 : null;
              const delta = midpoint !== null ? p.perfRating - midpoint : null;
              const sign = delta !== null && delta >= 0 ? "+" : "";
              return (
                <tr key={p.key} className="border-t border-stone-100">
                  <td className="px-3 py-2">
                    <Link
                      href={`/players/${playerSlug(p.key)}` as `/players/${string}`}
                      className="font-medium text-court-700 hover:underline"
                    >
                      {p.name ?? "(no name)"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-500">
                    {p.teams.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-stone-600">
                    {p.ntrpLabel !== undefined ? p.ntrpLabel.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {p.perfRating.toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      delta === null
                        ? "text-stone-400"
                        : delta >= 0.15
                          ? "text-emerald-700"
                          : delta <= -0.15
                            ? "text-rose-700"
                            : "text-stone-600"
                    }`}
                  >
                    {delta !== null ? `${sign}${delta.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-stone-600">
                    {p.matches}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-stone-400">
                  No players match the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BandChip({
  currentBand,
  value,
  label,
}: {
  currentBand: string;
  value: string;
  label: string;
}) {
  const active = currentBand === value;
  return (
    <Link
      href={{
        pathname: "/players",
        query: value ? { band: value } : undefined,
      }}
      className={`rounded px-2 py-0.5 text-xs ${
        active
          ? "bg-court-700 text-white"
          : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-100"
      }`}
    >
      {label}
    </Link>
  );
}

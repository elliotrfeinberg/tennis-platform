// Real crawl + perf-rating data.
//
// Renders the per-player NTRP performance ratings computed by
// `tennis-scrape ratings fit --model perf`. Sort + filter on the URL.

import Link from "next/link";
import { loadPerfRatings, type PerfRatingEntry } from "@/lib/perfRatings";

type SortKey = "perf" | "delta" | "matches" | "name";

function parseSearchParams(p: { sort?: string; q?: string; band?: string }) {
  const sort: SortKey =
    p.sort === "delta" || p.sort === "matches" || p.sort === "name"
      ? p.sort
      : "perf";
  const q = (p.q ?? "").trim().toLowerCase();
  const band = p.band?.trim() ?? "";
  return { sort, q, band };
}

function filterEntries(
  entries: PerfRatingEntry[],
  q: string,
  band: string
): PerfRatingEntry[] {
  return entries.filter((e) => {
    if (q) {
      const hay = (e.name ?? "").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (band) {
      if (e.ntrpLabel === undefined) return false;
      if (String(e.ntrpLabel) !== band) return false;
    }
    return true;
  });
}

function sortEntries(entries: PerfRatingEntry[], sort: SortKey): PerfRatingEntry[] {
  const out = [...entries];
  if (sort === "perf") {
    out.sort((a, b) => (b.perfRating ?? 0) - (a.perfRating ?? 0));
  } else if (sort === "delta") {
    const d = (e: PerfRatingEntry) =>
      e.ntrpLabel === undefined || e.perfRating === null ? -Infinity : e.perfRating - e.ntrpLabel;
    out.sort((a, b) => d(b) - d(a));
  } else if (sort === "matches") {
    out.sort((a, b) => b.matches - a.matches);
  } else {
    out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }
  return out;
}

export default async function RatingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string; band?: string }>;
}) {
  const params = await searchParams;
  const { sort, q, band } = parseSearchParams(params);

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
        <h1 className="text-2xl font-bold">Ratings</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">No perf-ratings JSON found.</p>
          <p className="mt-2">
            Run{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
              pnpm dev ratings fit ... --model perf
            </code>{" "}
            in <code>apps/worker</code>, then refresh.
          </p>
          {loadError && (
            <p className="mt-2 text-xs text-amber-700">{loadError}</p>
          )}
        </div>
      </div>
    );
  }

  const filtered = filterEntries(data.entries, q, band);
  const sorted = sortEntries(filtered, sort);

  // Band tally for the chips.
  const bandCounts = new Map<number, number>();
  for (const e of data.entries) {
    if (e.ntrpLabel === undefined) continue;
    bandCounts.set(e.ntrpLabel, (bandCounts.get(e.ntrpLabel) ?? 0) + 1);
  }
  const bandsSorted = [...bandCounts.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ratings</h1>
        <p className="text-sm text-stone-600">
          USTA-style performance ratings computed from{" "}
          <span className="font-mono">{data.entries.length}</span> crawled
          players. Score-aware, NTRP-scale output. Match table values
          empirically derived from tennisrecord.com.
        </p>
        <p className="mt-1 text-xs text-stone-400">
          Source:{" "}
          <span className="font-mono">{data.path.split("/").slice(-3).join("/")}</span>
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
        action="/ratings"
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
            className="mt-1 w-40 rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="perf">Perf rating (high → low)</option>
            <option value="delta">Δ vs roster label</option>
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
              <th className="px-3 py-2 text-right">Roster NTRP</th>
              <th className="px-3 py-2 text-right">Perf NTRP</th>
              <th className="px-3 py-2 text-right">Δ vs label</th>
              <th className="px-3 py-2 text-right">Matches</th>
              <th className="px-3 py-2">Recent</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const delta =
                p.ntrpLabel !== undefined && p.perfRating !== null
                  ? p.perfRating - p.ntrpLabel
                  : null;
              const sign = delta !== null && delta >= 0 ? "+" : "";
              const recent = p.history.slice(-3).reverse();
              return (
                <tr
                  key={p.key}
                  className="border-t border-stone-100 align-top"
                >
                  <td className="px-3 py-2 font-medium">{p.name ?? "(no name)"}</td>
                  <td className="px-3 py-2 text-xs text-stone-500">
                    {p.teams.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {p.ntrpLabel !== undefined ? p.ntrpLabel.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {p.perfRating !== null ? p.perfRating.toFixed(2) : "—"}
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
                  <td className="px-3 py-2">
                    <div className="space-y-0.5 text-xs">
                      {recent.map((m, i) => (
                        <div key={i} className="font-mono text-stone-500">
                          <span className="text-stone-400">{m.date}</span>{" "}
                          {m.gamesDiff >= 0 ? "+" : ""}
                          {m.gamesDiff}g · perf {m.perf.toFixed(2)} vs{" "}
                          {m.opponentMean.toFixed(2)}
                        </div>
                      ))}
                      {recent.length === 0 && (
                        <span className="text-stone-400">no matches</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-stone-400">
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
        pathname: "/ratings",
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

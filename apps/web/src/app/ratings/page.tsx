import { Ratings, type RatingsView } from "@/components/mm/screens/Ratings";
import { listPlayers, perfRatedCount } from "@/lib/players";

// Always reflect the latest nightly recompute rather than build-time data.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Aggregates (limit 1 — we only need total + bandCounts), the rated count,
  // and the top perf list.
  const agg = await listPlayers({ limit: 1 });
  const rated = await perfRatedCount();
  const top = await listPlayers({ sort: "perf", limit: 10 });

  const topRated = top.rows
    .filter((r) => r.perf != null)
    .map((r) => ({ id: r.id, name: r.name, perf: r.perf!, band: r.latestNtrp }));

  const view: RatingsView = {
    dist: agg.bandCounts,
    total: agg.total,
    rated,
    topRated,
  };
  return <Ratings view={view} />;
}

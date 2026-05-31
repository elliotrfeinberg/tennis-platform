import { Home, type HomeView } from "@/components/mm/screens/Home";
import { listPlayers, perfRatedCount } from "@/lib/players";
import { parseScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; season?: string; league?: string; flight?: string }>;
}) {
  const scope = parseScope(await searchParams);
  const agg = await listPlayers({ limit: 1, scope });
  const rated = await perfRatedCount(scope);
  const top = await listPlayers({ sort: "perf", limit: 1, scope });
  const t = top.rows[0];
  const view: HomeView = {
    total: agg.total,
    rated,
    dist: agg.bandCounts,
    top: t ? { id: t.id, name: t.name, perf: t.perf, band: t.latestNtrp } : null,
  };
  return <Home view={view} />;
}

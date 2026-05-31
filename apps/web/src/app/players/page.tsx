import { Directory, type DirView, type DirViewRow } from "@/components/mm/screens/Directory";
import { MobileDirectory } from "@/components/mm/mobile/Directory";
import { listPlayers, confidenceFromMatches } from "@/lib/players";
import { getScopeFromCookies } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; band?: string }>;
}) {
  const sp = await searchParams;
  const sort: "name" | "band" | "perf" =
    sp.sort === "name" ? "name" : sp.sort === "band" ? "band" : "perf";
  const q = (sp.q ?? "").trim();
  const band = sp.band?.trim() ?? "";
  const scope = await getScopeFromCookies();

  const data = await listPlayers({ q, band, sort, limit: 200, scope });

  // Year columns: the two most recent years present across the rows.
  const yearSet = new Set<number>();
  for (const r of data.rows) for (const b of r.bands) yearSet.add(b.year);
  const years = [...yearSet].sort((a, b) => a - b).slice(-2);

  const rows: DirViewRow[] = data.rows.map((p) => {
    const bandsByYear: Record<number, number | null> = {};
    for (const y of years) bandsByYear[y] = p.bands.find((b) => b.year === y)?.ntrp ?? null;
    const latestType = p.bands.length ? p.bands[p.bands.length - 1]!.ratingType : null;
    return {
      id: p.id,
      name: p.name,
      gender: p.gender,
      perf: p.perf,
      conf: p.perf != null ? confidenceFromMatches(p.matches) : null,
      type: latestType,
      bandsByYear,
    };
  });

  const view: DirView = {
    rows,
    years,
    bandCounts: data.bandCounts,
    total: data.total,
    shown: data.shown,
    q,
    sort,
    band,
  };
  return (
    <>
      <div className="mm-desktop-only"><Directory view={view} /></div>
      <div className="mm-mobile-only"><MobileDirectory view={view} /></div>
    </>
  );
}

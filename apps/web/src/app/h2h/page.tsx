import { H2H } from "@/components/mm/screens/H2H";
import { MobileH2H } from "@/components/mm/mobile/H2H";
import { headToHead } from "@/lib/h2h";
import { listPlayers } from "@/lib/players";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const sp = await searchParams;
  let aId = sp.a;
  let bId = sp.b;
  if (!aId || !bId) {
    const top = await listPlayers({ sort: "perf", limit: 2 });
    aId = aId ?? top.rows[0]?.id;
    bId = bId ?? top.rows[1]?.id ?? top.rows[0]?.id;
  }
  const data = aId && bId ? await headToHead(aId, bId) : null;
  if (!data) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "80px 44px", textAlign: "center", color: "var(--muted)" }}>
        Not enough rated players yet to compare. Check back as the crawl fills in.
      </div>
    );
  }
  return (
    <>
      <div className="mm-desktop-only"><H2H data={data} /></div>
      <div className="mm-mobile-only"><MobileH2H data={data} /></div>
    </>
  );
}

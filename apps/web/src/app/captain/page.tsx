import { Captain } from "@/components/mm/screens/Captain";
import { buildCaptain } from "@/lib/captain";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ flight?: string; team?: string; opp?: string }>;
}) {
  const sp = await searchParams;
  const view = await buildCaptain({ flightId: sp.flight, myTeamId: sp.team, oppTeamId: sp.opp });
  if (!view) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "80px 44px", textAlign: "center", color: "var(--muted)" }}>
        No flights ingested yet — the captain optimizer lights up once team match data is crawled.
      </div>
    );
  }
  return <Captain view={view} />;
}

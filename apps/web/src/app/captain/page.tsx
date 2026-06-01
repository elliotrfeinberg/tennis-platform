import { Captain } from "@/components/mm/screens/Captain";
import { MobileCaptain } from "@/components/mm/mobile/Captain";
import { buildCaptain } from "@/lib/captain";
import { getScopeFromCookies } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ flight?: string; team?: string; opp?: string }>;
}) {
  const sp = await searchParams;
  const scope = await getScopeFromCookies();
  const view = await buildCaptain({ flightId: sp.flight, myTeamId: sp.team, oppTeamId: sp.opp, scope });
  if (!view) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "80px 44px", textAlign: "center", color: "var(--muted)" }}>
        No flights ingested yet — the captain optimizer lights up once team match data is crawled.
      </div>
    );
  }
  // Key on the matchup so switching team/opponent/flight remounts the client
  // components with fresh availability + lineup state.
  const k = `${view.flightId}:${view.myTeamId}:${view.oppTeamId}`;
  return (
    <>
      <div className="mm-desktop-only"><Captain key={k} view={view} /></div>
      <div className="mm-mobile-only"><MobileCaptain key={k} view={view} /></div>
    </>
  );
}

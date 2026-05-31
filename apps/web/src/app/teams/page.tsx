import { Standings, type StandingsView } from "@/components/mm/screens/Standings";
import { MobileStandings } from "@/components/mm/mobile/Standings";
import { listFlights, flightStandings } from "@/lib/teams";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ flight?: string }>;
}) {
  const sp = await searchParams;
  const flights = await listFlights();
  const selectedId = sp.flight && flights.some((f) => f.id === sp.flight) ? sp.flight : flights[0]?.id ?? "";
  const { flight, rows } = selectedId
    ? await flightStandings(selectedId)
    : { flight: null, rows: [] };
  const view: StandingsView = { flight, flights, selectedId, rows };
  return (
    <>
      <div className="mm-desktop-only"><Standings view={view} /></div>
      <div className="mm-mobile-only"><MobileStandings view={view} /></div>
    </>
  );
}

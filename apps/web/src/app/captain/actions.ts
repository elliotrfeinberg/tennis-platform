"use server";

import { buildCaptain, type LineupView } from "@/lib/captain";
import { getScopeFromCookies } from "@/lib/scope";

// Re-run the lineup optimization with a client-supplied availability list.
// IMPORTANT: availability is competitive intel — it is used only for the
// duration of this request and is NEVER persisted (there is no availability
// table). The client holds it in localStorage and passes it here transiently.
export async function recomputeLineups(input: {
  flightId: string;
  myTeamId: string;
  oppTeamId: string;
  unavailable: string[];
}): Promise<{ lineups: LineupView[]; evaluated: number; error?: string } | null> {
  const scope = await getScopeFromCookies();
  const view = await buildCaptain({
    flightId: input.flightId,
    myTeamId: input.myTeamId,
    oppTeamId: input.oppTeamId,
    unavailable: input.unavailable,
    scope,
  });
  if (!view) return null;
  return { lineups: view.lineups, evaluated: view.evaluated, error: view.error };
}

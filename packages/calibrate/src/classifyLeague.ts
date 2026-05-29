export type MatchCategory = "adult" | "mixed" | "combo" | "other";

export function classifyLeague(
  league: string | undefined,
  teamName: string | undefined
): MatchCategory {
  const s = `${league ?? ""} ${teamName ?? ""}`.toLowerCase();
  // Order matters: "Mixed" must beat "Adult" because some leagues say
  // "Adult 18&Over Mixed". Combo checked before adult/mixed in case the
  // league string is "Combo Adult ...".
  if (s.includes("combo")) return "combo";
  if (
    s.includes("tri-level") ||
    s.includes("trilevel") ||
    s.includes("tri level")
  )
    return "other";
  if (s.includes("flexible") || s.includes("flex format")) return "other";
  if (s.includes("mixed")) return "mixed";
  if (s.includes("adult")) return "adult";
  // Team-name heuristics (NorCal patterns observed):
  if (teamName) {
    if (/\bc[wm]\d+\.\d/i.test(teamName)) return "combo";
    if (/\d+ax[wm]\d/i.test(teamName) || /\bmx\d+/i.test(teamName))
      return "mixed";
    if (/\d+a[wm]\d/i.test(teamName)) return "adult";
  }
  return "other";
}

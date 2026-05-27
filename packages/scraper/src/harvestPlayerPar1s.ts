// Discover the per-player `par1` hex tokens for every name on a team
// roster. Same pattern as extractOpponentPar1s — USTA renders roster
// links as __doPostBack only, so a Chromium clickPostback is required.
//
// One profile load + one postback per roster member. For a 24-player
// roster that's ~25 navigations × 3s polite delay ≈ 75s per team. Once
// harvested, the player par1 lets PoliteFetcher fetch the profile
// directly via the t=8 URL — no further browser usage.

import { extractViewStateIds } from "./viewStateIds.js";
import { parseTeamProfile } from "./parseTeamProfile.js";
import { parsePlayerProfile } from "./parsePlayerProfile.js";
import type { BrowserFetcher } from "./browserFetcher.js";

export interface PlayerPar1Entry {
  name: string;
  // USTA member id (10-digit numeric), pulled from the ViewState scan
  // on the team profile. Undefined if the parser couldn't map a name.
  memberId: string | undefined;
  // Player's hex token — drives the t=8 profile URL.
  playerPar1: string;
}

export interface PlayerPar1Error {
  name: string;
  linkButtonId: string | undefined;
  message: string;
}

export interface HarvestPlayerPar1sResult {
  teamName: string;
  players: PlayerPar1Entry[];
  errors: PlayerPar1Error[];
}

export async function harvestPlayerPar1s(
  browser: BrowserFetcher,
  teamProfileUrl: string
): Promise<HarvestPlayerPar1sResult> {
  const seed = await browser.fetch(teamProfileUrl);
  if (!seed.body) {
    throw new Error(
      `Empty body fetching ${teamProfileUrl} (status ${seed.status})`
    );
  }
  const seedParsed = parseTeamProfile(seed.body);
  const viewStateIds = extractViewStateIds(seed.body);
  const teamName = seedParsed.header.teamName;

  const players: PlayerPar1Entry[] = [];
  const errors: PlayerPar1Error[] = [];

  for (const entry of seedParsed.roster) {
    if (!entry.linkButtonId) {
      errors.push({
        name: entry.name,
        linkButtonId: undefined,
        message: "no anchor id on roster entry",
      });
      continue;
    }
    try {
      const result = await browser.clickPostback(
        teamProfileUrl,
        entry.linkButtonId
      );
      if (!result.body) {
        errors.push({
          name: entry.name,
          linkButtonId: entry.linkButtonId,
          message: `empty postback body (status ${result.status})`,
        });
        continue;
      }
      const playerParsed = parsePlayerProfile(result.body);
      if (!playerParsed.header.playerPar1) {
        errors.push({
          name: entry.name,
          linkButtonId: entry.linkButtonId,
          message: `no playerPar1 in destination page (h1="${playerParsed.header.name}")`,
        });
        continue;
      }
      // Sanity check: the destination's player name should match the
      // roster entry we clicked. Mismatch = postback resolved to the
      // wrong player (or fell back to a default page).
      if (
        normalizeName(playerParsed.header.name) !==
        normalizeName(entry.name)
      ) {
        errors.push({
          name: entry.name,
          linkButtonId: entry.linkButtonId,
          message: `postback resolved to "${playerParsed.header.name}" instead of "${entry.name}"`,
        });
        continue;
      }
      players.push({
        name: entry.name,
        memberId: viewStateIds.playersByName.get(entry.name),
        playerPar1: playerParsed.header.playerPar1,
      });
    } catch (err) {
      errors.push({
        name: entry.name,
        linkButtonId: entry.linkButtonId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { teamName, players, errors };
}

function normalizeName(s: string): string {
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

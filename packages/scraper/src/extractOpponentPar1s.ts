// Harvest opponent team par1 hex tokens from a team-profile standings table.
//
// Why this needs a browser fetcher: USTA renders the 7 standings team
// links as ASP.NET __doPostBack handlers — no par1 in the href. A static
// postback replay (PoliteFetcher) loses the CSRF re-init that USTA's
// MS Ajax does client-side, so the server bounces back to a default
// page. A real Chromium click runs the page's own JS in non-strict
// context, the postback navigates, and the destination URL carries the
// opponent's par1.
//
// One profile load + one postback-click per opponent. For a 7-team
// subflight that's 7 navigations against ~3s polite delay = ~21s of
// browser time per harvest. The result is cacheable for the season.

import { parseTeamProfile } from "./parseTeamProfile.js";
import type { BrowserFetcher } from "./browserFetcher.js";

export interface OpponentPar1Entry {
  teamName: string;
  par1: string;
}

export interface OpponentPar1Error {
  teamName: string;
  linkButtonId: string | undefined;
  message: string;
}

export interface ExtractOpponentPar1sResult {
  ownTeamName: string;
  ownPar1: string | undefined;
  opponents: OpponentPar1Entry[];
  errors: OpponentPar1Error[];
}

// Navigate the browser to the given team-profile URL, then click through
// each non-self standings row to recover its par1. Returns one entry per
// opponent that successfully resolved; failures land in errors[].
export async function extractOpponentPar1s(
  browser: BrowserFetcher,
  ownTeamProfileUrl: string
): Promise<ExtractOpponentPar1sResult> {
  const seed = await browser.fetch(ownTeamProfileUrl);
  if (!seed.body) {
    throw new Error(
      `Empty body fetching ${ownTeamProfileUrl} (status ${seed.status})`
    );
  }
  const seedParsed = parseTeamProfile(seed.body);
  const ownTeamName = seedParsed.header.teamName;
  const ownPar1 = par1FromShareUrl(seedParsed.header.shareUrl);

  const opponents: OpponentPar1Entry[] = [];
  const errors: OpponentPar1Error[] = [];

  for (const row of seedParsed.standings) {
    if (row.teamName === ownTeamName) continue;
    if (!row.linkButtonId) {
      errors.push({
        teamName: row.teamName,
        linkButtonId: undefined,
        message: "no anchor id on standings row",
      });
      continue;
    }
    try {
      const result = await browser.clickPostback(
        ownTeamProfileUrl,
        row.linkButtonId
      );
      if (!result.body) {
        errors.push({
          teamName: row.teamName,
          linkButtonId: row.linkButtonId,
          message: `empty postback body (status ${result.status})`,
        });
        continue;
      }
      // Authoritative par1 source is the destination page's own share
      // URL — the postback may or may not change page.url() depending
      // on whether USTA uses Server.Transfer vs Response.Redirect, but
      // shareUrl is rendered into the page body either way.
      const destParsed = parseTeamProfile(result.body);
      const par1 = par1FromShareUrl(destParsed.header.shareUrl);
      if (!par1) {
        errors.push({
          teamName: row.teamName,
          linkButtonId: row.linkButtonId,
          message: `no par1 in destination page shareUrl (resolved to "${destParsed.header.teamName}")`,
        });
        continue;
      }
      // Sanity check: the destination's team name should match the row
      // we postback'd. A mismatch means the click resolved to the wrong
      // team (CSRF re-init failed, fell back to default page, etc.).
      if (destParsed.header.teamName !== row.teamName) {
        errors.push({
          teamName: row.teamName,
          linkButtonId: row.linkButtonId,
          message: `postback resolved to "${destParsed.header.teamName}" instead of "${row.teamName}"`,
        });
        continue;
      }
      opponents.push({ teamName: row.teamName, par1 });
    } catch (err) {
      errors.push({
        teamName: row.teamName,
        linkButtonId: row.linkButtonId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ownTeamName, ownPar1, opponents, errors };
}

function par1FromShareUrl(shareUrl: string | undefined): string | undefined {
  if (!shareUrl) return undefined;
  return (shareUrl.match(/par1=([A-F0-9]+)/) ?? [])[1];
}

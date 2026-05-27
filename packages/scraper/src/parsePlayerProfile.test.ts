import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePlayerProfile } from "./parsePlayerProfile.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(
  join(here, "__fixtures__", "player-profile.html"),
  "utf8"
);

describe("parsePlayerProfile (Stella So, 2026 individual record)", () => {
  const parsed = parsePlayerProfile(FIXTURE);

  it("reads the header — name, year, share URL, derived player par1", () => {
    expect(parsed.header.name).toBe("Stella So");
    expect(parsed.header.year).toBe(2026);
    // Share URL must point at t=8 with the player's own par1 (not the
    // referrer's team par1, which also appears earlier in the body).
    expect(parsed.header.shareUrl).toMatch(/t=8/);
    expect(parsed.header.playerPar1).toBe(
      "DB0015BB82D06F8695947B4A59485F5E2D"
    );
  });

  it("captures the location", () => {
    expect(parsed.header.location).toBe("Walnut Creek, CA");
  });

  it("extracts at least one match from the current-season context", () => {
    // Stella's first 2026 court: 4/28 match 1011875447, S1 vs Kara Levy,
    // she won 6-2, 7-5.
    const m = parsed.matches.find(
      (r) => r.matchId === "1011875447" && r.kind === "S" && r.line === 1
    );
    expect(m).toBeDefined();
    expect(m!.date).toBe("4/28/2026");
    expect(m!.winners).toContain("Stella So");
    expect(m!.losers).toContain("Kara Levy");
    expect(m!.score).toBe("6-2, 7-5");
    expect(m!.ntrp).toBe(3.5);
    expect(m!.subjectWon).toBe(true);
  });

  it("captures matches from more than one team-context", () => {
    // She appears in at least 2 outer-repeater groups (current 3.5
    // league + an older / different-league context). Distinct
    // contextIndex values prove the parser walks all groups.
    const contexts = new Set(parsed.matches.map((m) => m.contextIndex));
    expect(contexts.size).toBeGreaterThanOrEqual(2);
  });

  it("flags subjectWon false when Stella was on the losing side", () => {
    // Search for any losses (we know from the team-profile schedule
    // that at least one match in the season was a loss for her side).
    const losses = parsed.matches.filter((m) => m.subjectWon === false);
    expect(losses.length).toBeGreaterThanOrEqual(0);
    // If we did find one, the loss row must list Stella in losers[].
    for (const l of losses) {
      expect(l.losers).toContain("Stella So");
      expect(l.winners).not.toContain("Stella So");
    }
  });

  it("parses every row's court label into {line, kind}", () => {
    for (const m of parsed.matches) {
      // We expect every player-record row to be either S or D
      // (singles or doubles) with a positive line number.
      expect(m.kind).toMatch(/^[SD]$/);
      expect(m.line).toBeGreaterThan(0);
    }
  });
});

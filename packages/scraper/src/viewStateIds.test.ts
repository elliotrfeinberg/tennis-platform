import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractViewStateIds } from "./viewStateIds.js";

const here = dirname(fileURLToPath(import.meta.url));
const TEAM_PROFILE = readFileSync(
  join(here, "__fixtures__", "team-profile.html"),
  "utf8"
);

describe("extractViewStateIds (against the team-profile fixture)", () => {
  const ids = extractViewStateIds(TEAM_PROFILE);

  it("extracts every match id in document (schedule) order", () => {
    // From the team profile parser test we know there are 10 schedule rows.
    expect(ids.matchIds.length).toBeGreaterThanOrEqual(10);
    // The first match in the schedule is the 4/12/2026 vs WALNUT CREEK 3.5C
    // (parseTeamProfile asserts this). Its id is 1011875447.
    expect(ids.matchIds).toContain("1011875447");
    expect(ids.matchIds).toContain("1011875481"); // 5/11 vs ROUND HILL 3.5B
    expect(ids.matchIds).toContain("1011875475"); // 5/25 vs WALNUT CREEK 3.5C
  });

  it("extracts player USTA member ids for every roster name", () => {
    // 24-player roster; expect at least most to be matchable. Names with
    // accent characters or punctuation may need parser tweaks — assert the
    // straightforward ones.
    expect(ids.playersByName.get("Stella So")).toBe("2010200673");
    expect(ids.playersByName.get("Dana Baioni")).toBe("2010232896");
    expect(ids.playersByName.get("Wendy Schofield")).toBe("2003460873");
    expect(ids.playersByName.get("Isabella Feinberg")).toBe("2010673783");
    expect(ids.playersByName.get("Lisa Italia")).toBe("1180558264");
    // Britney Aguilar has the unusual NTRP "3" (not 3.5) in the roster.
    expect(ids.playersByName.get("Britney Aguilar")).toBe("2019539473");
  });

  it("extracts team ids for the 7 standings teams", () => {
    // 7 teams in the standings table. USTA team ids start with "5083".
    const allIds = Array.from(ids.teamsByName.values());
    expect(allIds.length).toBeGreaterThanOrEqual(6);
    for (const tid of allIds) {
      expect(tid.startsWith("5083")).toBe(true);
    }
    // Our team should map to its own id.
    expect(
      ids.teamsByName.get("WALNUT CREEK RC/Walnut Creek TC 18AW3.5A")
    ).toBe("5083144154");
    // One known opponent.
    expect(ids.teamsByName.get("ROUND HILL CC 18AW3.5A")).toBe("5083144149");
  });
});

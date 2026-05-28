import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScorecard } from "./parseScorecard.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(
  join(here, "__fixtures__", "scorecard.html"),
  "utf8"
);
const RETIRED_FIXTURE = readFileSync(
  join(here, "__fixtures__", "scorecard-retired.html"),
  "utf8"
);

// This fixture is a 2S+3D Adult 18+ Women's 3.5 match. Other league
// formats (Combo 3D, Tri-Level 1S+2D, Mixed 5D) would have different
// court counts; the parser is format-agnostic by design.
describe("parseScorecard (5/11/2026 vs ROUND HILL fixture)", () => {
  const parsed = parseScorecard(FIXTURE);

  it("reads the match header", () => {
    const h = parsed.header;
    expect(h.matchNumber).toBe("1011875481");
    // Cheerio collapses </strong></font><br><br><strong> to no whitespace,
    // so the league string sits flush against "Status:" in the source. The
    // parser must terminate cleanly at "Status" with zero-or-more spaces.
    expect(h.league).toBe("2026 ADULT 18&Over");
    expect(h.homeTeamName).toBe("ROUND HILL CC 18AW3.5B");
    expect(h.visitorTeamName).toBe(
      "WALNUT CREEK RC/Walnut Creek TC 18AW3.5A"
    );
    expect(h.datePlayed).toContain("5/11/2026");
    expect(h.dateScheduled).toContain("5/11/2026");
    expect(h.entryDate).toContain("5/25/2026");
    expect(h.status).toContain("Confirmed by Lisa Italia");
  });

  it("parses every court in the fixture (2S + 3D)", () => {
    // Per-fixture assertion. A different league's scorecard would have a
    // different court count — see file header for known formats.
    expect(parsed.courts).toHaveLength(5);
    const singles = parsed.courts.filter((c) => c.kind === "S");
    const doubles = parsed.courts.filter((c) => c.kind === "D");
    expect(singles).toHaveLength(2);
    expect(doubles).toHaveLength(3);
    // Lines are 1..N per kind, not 1..total.
    expect(singles.map((c) => c.line).sort()).toEqual([1, 2]);
    expect(doubles.map((c) => c.line).sort()).toEqual([1, 2, 3]);
  });

  it("extracts player lineups for each court", () => {
    const d1 = parsed.courts.find(
      (c) => c.kind === "D" && c.line === 1
    )!;
    expect(d1.homePlayers).toEqual(["Kara Chizever", "Shawn Young"]);
    expect(d1.visitorPlayers).toEqual(["Lori Guariento", "Wendy Schofield"]);

    const s1 = parsed.courts.find(
      (c) => c.kind === "S" && c.line === 1
    )!;
    expect(s1.homePlayers).toEqual(["Tori DeCoite"]);
    expect(s1.visitorPlayers).toEqual(["Melanie Espejo"]);

    const d2 = parsed.courts.find(
      (c) => c.kind === "D" && c.line === 2
    )!;
    expect(d2.homePlayers).toEqual(["Andrea Eubanks", "Christine Brashear"]);
    expect(d2.visitorPlayers).toEqual(["Linda Choi", "Isabella Feinberg"]);
  });

  it("reads set scores for each court, oriented home/visitor (NOT match-winner-first)", () => {
    // USTA's scorecard renders set scores from the MATCH WINNER's
    // perspective per set, regardless of which side is home. The
    // parser detects homeWon from mark.gif and reorients to {home,
    // visitor} so callers get a consistent home-vs-visitor view.

    // D1: home won (mark on home spacer). Scores stay as parsed.
    const d1 = parsed.courts.find((c) => c.kind === "D" && c.line === 1)!;
    expect(d1.homeWon).toBe(true);
    expect(d1.sets).toEqual([
      { home: 6, visitor: 2 },
      { home: 6, visitor: 0 },
    ]);

    // S1: visitor won. The cell showed "6-2 6-2" from visitor's view;
    // after orientation home has the smaller numbers.
    const s1 = parsed.courts.find((c) => c.kind === "S" && c.line === 1)!;
    expect(s1.homeWon).toBe(false);
    expect(s1.sets).toEqual([
      { home: 2, visitor: 6 },
      { home: 2, visitor: 6 },
    ]);

    // D3: home won.
    const d3 = parsed.courts.find((c) => c.kind === "D" && c.line === 3)!;
    expect(d3.homeWon).toBe(true);
    expect(d3.sets).toEqual([
      { home: 6, visitor: 2 },
      { home: 7, visitor: 5 },
    ]);
  });

  it("infers winner from mark.gif presence", () => {
    // From the team-profile's view: visitor (WALNUT CREEK 3.5A) won 3-2.
    // So home (ROUND HILL 3.5B) won 2 courts, visitor won 3.
    const homeWins = parsed.courts.filter((c) => c.homeWon === true).length;
    const visitorWins = parsed.courts.filter((c) => c.homeWon === false).length;
    expect(homeWins + visitorWins).toBe(5);
    // Specifically: D1 home win (mark on home side), S1 visitor win, D2 visitor
    // win, S2 visitor win, D3 home win.
    const d1 = parsed.courts.find((c) => c.kind === "D" && c.line === 1)!;
    const d3 = parsed.courts.find((c) => c.kind === "D" && c.line === 3)!;
    const s1 = parsed.courts.find((c) => c.kind === "S" && c.line === 1)!;
    expect(d1.homeWon).toBe(true);
    expect(d3.homeWon).toBe(true);
    expect(s1.homeWon).toBe(false);
  });

  it("marks each completed court as completed", () => {
    for (const c of parsed.courts) {
      expect(c.completed).toBe(true);
    }
  });

  it("has no retirements or defaults on a clean match", () => {
    for (const c of parsed.courts) {
      expect(c.retired).toBeUndefined();
      expect(c.defaulted).toBeUndefined();
    }
  });
});

describe("parseScorecard (4/12/2026 fixture with court 4 retirement)", () => {
  const parsed = parseScorecard(RETIRED_FIXTURE);

  it("flags the retiring side and still infers the winner", () => {
    // Charlotte Fisher (home, 2# Singles) LOST the first set 4-6 to
    // Rebecca Erickson, then retired before set 2. Visitor takes the
    // court via the mark.gif. The scorecard cell shows "6-4" from
    // Rebecca's (match-winner's) perspective; we orient to home-first.
    const s2 = parsed.courts.find(
      (c) => c.kind === "S" && c.line === 2
    )!;
    expect(s2).toBeDefined();
    expect(s2.homePlayers).toEqual(["Charlotte Fisher"]);
    expect(s2.visitorPlayers).toEqual(["Rebecca Erickson"]);
    expect(s2.retired).toBe("home");
    expect(s2.defaulted).toBeUndefined();
    expect(s2.homeWon).toBe(false);
    expect(s2.completed).toBe(false);
    // After orientation: home (Charlotte) had 4, visitor (Rebecca) had 6.
    expect(s2.sets).toEqual([{ home: 4, visitor: 6 }]);
  });

  it("leaves the other 4 courts unflagged", () => {
    const others = parsed.courts.filter(
      (c) => !(c.kind === "S" && c.line === 2)
    );
    expect(others).toHaveLength(4);
    for (const c of others) {
      expect(c.retired).toBeUndefined();
      expect(c.defaulted).toBeUndefined();
    }
  });
});

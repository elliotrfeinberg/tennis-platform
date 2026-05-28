import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRatingSearch } from "./parseRatingSearch.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(
  join(here, "__fixtures__", "ntrp-search-women-3.5-2025.html"),
  "utf8"
);

describe("parseRatingSearch (2025 NorCal Women 3.5 search dump)", () => {
  const parsed = parseRatingSearch(FIXTURE);

  it("captures the page header context", () => {
    expect(parsed.context).toBeDefined();
    expect(parsed.context!).toMatch(/USTA\/NO\. CALIFORNIA/);
    expect(parsed.context!).toMatch(/2025 ADULT 18&Over/);
    expect(parsed.context!).toMatch(/Women's 3\.5/);
  });

  it("extracts ~1900 rows (the entire flight roster)", () => {
    // From the captured page: 1921 player anchors. Parser may drop a
    // handful for malformed rows — anything above 1900 is healthy.
    expect(parsed.rows.length).toBeGreaterThan(1900);
  });

  it("returns rows spanning multiple NTRP bands", () => {
    const dist = new Map<number, number>();
    for (const r of parsed.rows) {
      if (r.ntrpLevel === undefined) continue;
      dist.set(r.ntrpLevel, (dist.get(r.ntrpLevel) ?? 0) + 1);
    }
    // The 3.5 flight returns 3.0 / 3.5 / 4.0 ratings in the same dump
    // (players bumped up or down from where they registered).
    expect(dist.has(3.0)).toBe(true);
    expect(dist.has(3.5)).toBe(true);
    expect(dist.has(4.0)).toBe(true);
    expect(dist.get(3.5)!).toBeGreaterThan(dist.get(4.0)!);
  });

  it("parses the first row (Aaronson, Laurie) correctly", () => {
    const aaronson = parsed.rows.find((r) =>
      r.name.startsWith("Aaronson")
    );
    expect(aaronson).toBeDefined();
    expect(aaronson!.name).toBe("Aaronson, Laurie");
    expect(aaronson!.gender).toBe("F");
    expect(aaronson!.city).toBe("Kentfield");
    expect(aaronson!.state).toBe("CA");
    expect(aaronson!.ntrpLevel).toBe(3.5);
    expect(aaronson!.ratingDate).toBe("12/31/2025");
    expect(aaronson!.ratingType).toBe("C");
    expect(aaronson!.playerPar1Encoded).toBeDefined();
    expect(aaronson!.playerPar1Encoded!.length).toBeGreaterThan(20);
    // Decoded form ends with `==` padding (base64-ish).
    expect(aaronson!.playerPar1).toMatch(/==$/);
  });

  it("locates known roster players from our subflight crawl", () => {
    // These names appear on the WALNUT CREEK 3.5A roster (per our
    // team-profile fixture). They should all be in the year-end dump
    // with a 3.0, 3.5, or 4.0 band.
    for (const name of [
      "Italia, Lisa",
      "So, Stella",
      "Aguilar, Britney",
      "Feinberg, Isabella",
    ]) {
      const row = parsed.rows.find((r) => r.name === name);
      expect(row, `expected ${name} in year-end dump`).toBeDefined();
      expect([3.0, 3.5, 4.0]).toContain(row!.ntrpLevel);
    }
  });

  it("identifies the 'C' rating type as the dominant source", () => {
    const types = new Map<string, number>();
    for (const r of parsed.rows) {
      if (!r.ratingType) continue;
      types.set(r.ratingType, (types.get(r.ratingType) ?? 0) + 1);
    }
    // Computer-rated should be by far the most common.
    const c = types.get("C") ?? 0;
    const others = [...types.entries()]
      .filter(([k]) => k !== "C")
      .reduce((sum, [, n]) => sum + n, 0);
    expect(c).toBeGreaterThan(others * 10);
  });
});

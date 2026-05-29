import { describe, expect, it } from "vitest";
import { classifyLeague } from "./classifyLeague.js";

describe("classifyLeague", () => {
  it("adult league string → adult", () => {
    expect(
      classifyLeague("2026 ADULT 18&Over - Women's 3.5", undefined)
    ).toBe("adult");
  });

  it("mixed league string → mixed", () => {
    expect(classifyLeague("2026 Mixed 18&Over - 7.0", undefined)).toBe(
      "mixed"
    );
  });

  it("combo league string → combo", () => {
    expect(classifyLeague("2026 Combo 7.5 Women", undefined)).toBe("combo");
  });

  it("tri-level league string → other", () => {
    expect(classifyLeague("2026 Tri-Level 18&Over", undefined)).toBe("other");
  });

  it("flexible format league string → other", () => {
    expect(classifyLeague("2026 Flexible Format", undefined)).toBe("other");
  });

  it("no league, adult team name → adult", () => {
    expect(classifyLeague(undefined, "WALNUT CREEK 18AW3.5A")).toBe("adult");
  });

  it("no league, combo team name → combo", () => {
    expect(classifyLeague(undefined, "PLEASANTON CW7.5A")).toBe("combo");
  });

  it("no league, mixed team-name with MX pattern → mixed", () => {
    expect(classifyLeague(undefined, "SOMETHING MX18W3.5A")).toBe("mixed");
  });

  it("no league, no team → other", () => {
    expect(classifyLeague(undefined, undefined)).toBe("other");
  });

  it("'Adult 18&Over Mixed' classifies as mixed (mixed beats adult on order)", () => {
    expect(classifyLeague("Adult 18&Over Mixed", undefined)).toBe("mixed");
  });

  it("40+ adult league → adult", () => {
    expect(classifyLeague("2026 ADULT 40&Over - Women's 3.5", undefined)).toBe(
      "adult"
    );
  });

  it("mixed 40+ → mixed", () => {
    expect(classifyLeague("Mixed 40&Over - 7.5", undefined)).toBe("mixed");
  });
});

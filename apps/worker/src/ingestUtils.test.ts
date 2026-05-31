import { describe, expect, it } from "vitest";
import {
  firstLast,
  mapGender,
  parseUsDate,
  genderWord,
  parseTeamCode,
} from "./ingestUtils.js";

describe("firstLast", () => {
  it("flips 'Last, First' to 'First Last'", () => {
    expect(firstLast("Mittelberger, James")).toBe("James Mittelberger");
  });
  it("handles a multi-word last name", () => {
    expect(firstLast("A Mittelberger, James")).toBe("James A Mittelberger");
  });
  it("passes comma-less names through, collapsing whitespace", () => {
    expect(firstLast("  Jane   Doe ")).toBe("Jane Doe");
  });
});

describe("mapGender", () => {
  it("maps M and F directly", () => {
    expect(mapGender("M")).toBe("M");
    expect(mapGender("F")).toBe("F");
  });
  it("maps anything else (incl. undefined) to X", () => {
    expect(mapGender(undefined)).toBe("X");
    expect(mapGender("")).toBe("X");
    expect(mapGender("Mixed")).toBe("X");
  });
});

describe("parseUsDate", () => {
  it("parses M/D/YYYY to a local Date", () => {
    const d = parseUsDate("12/31/2025");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(11); // December (0-indexed)
    expect(d!.getDate()).toBe(31);
  });
  it("ignores a trailing time component", () => {
    const d = parseUsDate("5/11/2026 6:30 PM");
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(11);
  });
  it("returns null for missing or non-date input", () => {
    expect(parseUsDate(undefined)).toBeNull();
    expect(parseUsDate("Pending")).toBeNull();
  });
});

describe("genderWord", () => {
  it("labels each gender", () => {
    expect(genderWord("F")).toBe("Women's");
    expect(genderWord("M")).toBe("Men's");
    expect(genderWord("X")).toBe("Mixed");
  });
});

describe("parseTeamCode", () => {
  it("parses an adult women's team code", () => {
    expect(parseTeamCode("MORAGA CC 40AW3.5A")).toEqual({
      division: 40,
      gender: "F",
      ntrp: 3.5,
    });
  });
  it("parses an adult men's team code", () => {
    expect(parseTeamCode("SAN CARLOS TC 18AM4.0B")).toEqual({
      division: 18,
      gender: "M",
      ntrp: 4.0,
    });
  });
  it("handles the optional trailing team letter being absent", () => {
    expect(parseTeamCode("SOME CLUB 55AW4.5")).toEqual({
      division: 55,
      gender: "F",
      ntrp: 4.5,
    });
  });
  it("forces gender X for the mixed category", () => {
    expect(parseTeamCode("CLUB 40XW3.5A")?.gender).toBe("X");
  });
  it("parses a mixed (MX) team code", () => {
    expect(parseTeamCode("ALMADEN SR 18MX7.0A")).toEqual({
      division: 18,
      gender: "X",
      ntrp: 7.0,
    });
  });
  it("parses a 2-digit mixed rating (10.0)", () => {
    expect(parseTeamCode("BAY CLUB COURTSIDE 18MX10.0")).toEqual({
      division: 18,
      gender: "X",
      ntrp: 10.0,
    });
  });
  it("returns null when there is no flight code (e.g. combo)", () => {
    expect(parseTeamCode("WALNUT CREEK RC Combo Team")).toBeNull();
    expect(parseTeamCode("MORAGA CC")).toBeNull();
  });
});

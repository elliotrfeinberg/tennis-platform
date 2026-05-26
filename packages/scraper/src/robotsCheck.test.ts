import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "./robotsCheck";

describe("robots.txt parsing", () => {
  it("parses standard format", () => {
    const txt = `
User-agent: *
Disallow: /admin/
Disallow: /private

User-agent: BadBot
Disallow: /
`;
    const rules = parseRobots(txt);
    expect(rules.disallow).toEqual(["/admin/", "/private"]);
  });

  it("allows paths not matching any Disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin/");
    expect(isAllowed("https://example.com/leagues/foo", rules)).toBe(true);
    expect(isAllowed("https://example.com/admin/secret", rules)).toBe(false);
  });

  it("ignores comments", () => {
    const rules = parseRobots("User-agent: * # main group\nDisallow: /x # block");
    expect(rules.disallow).toEqual(["/x"]);
  });
});

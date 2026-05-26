import { describe, expect, it } from "vitest";
import {
  playerHistoryUrl,
  ratingSearchUrl,
  teamUrl,
} from "./tennislinkUrls.js";

describe("tennislink URL builders", () => {
  it("ratingSearchUrl encodes params", () => {
    const url = ratingSearchUrl({
      firstName: "John",
      lastName: "Doe O'Hara",
      section: "Florida",
    });
    expect(url).toContain("tennislink.usta.com");
    expect(url).toContain("firstName=John");
    expect(url).toContain("lastName=Doe+O");
    expect(url).toContain("Hara");
    expect(url).toContain("section=Florida");
  });

  it("playerHistoryUrl encodes ids with special chars", () => {
    const url = playerHistoryUrl("abc/123");
    expect(url).toContain("abc%2F123");
  });

  it("teamUrl includes team id", () => {
    const url = teamUrl("team-42");
    expect(url).toContain("t=team-42");
  });
});

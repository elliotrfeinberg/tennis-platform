import { describe, expect, it } from "vitest";
import {
  playerHistoryUrl,
  ratingSearchUrl,
  teamUrl,
} from "./tennislinkUrls";

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

  it("teamUrl includes team code and year", () => {
    const url = teamUrl("ABC123", 2025);
    expect(url).toContain("TeamCode=ABC123");
    expect(url).toContain("CYear=2025");
    expect(url).toContain("Level=T");
  });
});

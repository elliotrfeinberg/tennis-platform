import { describe, expect, it } from "vitest";
import { ratingSearchUrl } from "./tennislinkUrls.js";

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
});

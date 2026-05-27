import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPostbackBody,
  extractAspNetState,
} from "./aspNetState.js";

const here = dirname(fileURLToPath(import.meta.url));
const TEAM_PROFILE = readFileSync(
  join(here, "__fixtures__", "team-profile.html"),
  "utf8"
);

describe("extractAspNetState", () => {
  it("pulls __VIEWSTATE from the real team-profile fixture", () => {
    const state = extractAspNetState(TEAM_PROFILE);
    // ASP.NET ViewState always starts with "/wEP..." (base64 of binary
    // type token 0x66 0x65...) — sanity check it looks right.
    expect(state.viewState.startsWith("/wEP")).toBe(true);
    expect(state.viewState.length).toBeGreaterThan(100);
  });

  it("captures __VIEWSTATEGENERATOR; eventValidation is optional", () => {
    const state = extractAspNetState(TEAM_PROFILE);
    // The team-profile page in our fixture has VIEWSTATEGENERATOR but no
    // EVENTVALIDATION. Confirm we surface what's present and don't choke
    // on what's absent.
    expect(state.viewStateGenerator).toBeDefined();
    expect(state.eventValidation).toBeUndefined();
  });

  it("throws a helpful error on a page without __VIEWSTATE", () => {
    expect(() => extractAspNetState("<html><body>nope</body></html>")).toThrow(
      /__VIEWSTATE/
    );
  });
});

describe("buildPostbackBody", () => {
  it("urlencodes the standard ASP.NET postback fields with __EVENTTARGET", () => {
    const state = extractAspNetState(TEAM_PROFILE);
    const body = buildPostbackBody(
      state,
      "ctl00$mainContent$rptPlayersForTeam$ctl06$LinkButton17"
    );
    const params = new URLSearchParams(body);
    expect(params.get("__EVENTTARGET")).toBe(
      "ctl00$mainContent$rptPlayersForTeam$ctl06$LinkButton17"
    );
    expect(params.get("__EVENTARGUMENT")).toBe("");
    expect(params.get("__VIEWSTATE")).toBe(state.viewState);
  });

  it("includes other hidden inputs from the form", () => {
    const state = extractAspNetState(TEAM_PROFILE);
    const body = buildPostbackBody(state, "x");
    const params = new URLSearchParams(body);
    // We don't assert specific names since USTA may add/remove hidden
    // fields between releases, but anything in otherHidden must round-trip.
    for (const [k, v] of Object.entries(state.otherHidden)) {
      expect(params.get(k)).toBe(v);
    }
  });
});

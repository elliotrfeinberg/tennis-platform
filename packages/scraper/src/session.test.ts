import { describe, expect, it } from "vitest";
import { isLoginRedirect } from "./session.js";

describe("isLoginRedirect", () => {
  it("treats a 302 to /Dashboard/Main/Login.aspx as auth-wall", () => {
    expect(
      isLoginRedirect(
        302,
        "https://tennislink.usta.com/Dashboard/Main/Login.aspx?returnURL=foo"
      )
    ).toBe(true);
  });

  it("treats a 302 to account.usta.com (Auth0) as auth-wall", () => {
    expect(
      isLoginRedirect(302, "https://account.usta.com/authorize?client_id=...")
    ).toBe(true);
  });

  it("ignores 200 OK responses regardless of body", () => {
    expect(isLoginRedirect(200, undefined)).toBe(false);
  });

  it("ignores 302s that go to a non-login page", () => {
    expect(
      isLoginRedirect(
        302,
        "https://tennislink.usta.com/Leagues/ErrorHandling/RecordNotFound.aspx"
      )
    ).toBe(false);
  });

  it("handles a 301 the same way as a 302", () => {
    expect(
      isLoginRedirect(301, "https://account.usta.com/u/login?state=abc")
    ).toBe(true);
  });

  it("treats missing Location header as not-a-login-redirect", () => {
    expect(isLoginRedirect(302, undefined)).toBe(false);
  });
});

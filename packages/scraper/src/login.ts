// Automated USTA login via Playwright. Drives the Auth0 Universal Login
// (account.usta.com/u/login) with a stored username/password, then captures
// the resulting session cookies so the polite/undici fetchers can reuse them.
//
// Assumes the account has NO MFA. If Auth0 presents a CAPTCHA or 2FA, the
// headless submit won't complete — run with headless=false to solve the
// challenge by hand (the cookies are still captured once you land back on
// tennislink).
//
// This intentionally reverses the original "no login automation" decision;
// it's brittle against Auth0 markup changes by nature. Selectors confirmed
// 2026-05-28: #username, #password, button[type=submit].

import type { UstaSession } from "./session.js";

const ENTRY =
  "https://tennislink.usta.com/Leagues/Main/StatsAndStandings.aspx?t=3";
const LOGIN_HOST_RE = /account\.usta\.com\/u\/login/i;
const APP_HOST_RE = /tennislink\.usta\.com/i;

export interface LoginOptions {
  username: string;
  password: string;
  contactEmail: string;
  headless?: boolean;
}

export async function loginAndCaptureSession(
  opts: LoginOptions
): Promise<UstaSession> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    // Auth-walled → redirect to Auth0. (A pre-existing valid context would
    // skip this, but we start fresh, so login is expected.)
    await page
      .waitForURL(LOGIN_HOST_RE, { timeout: 30000 })
      .catch(() => undefined);

    if (LOGIN_HOST_RE.test(page.url())) {
      await page.fill("#username", opts.username);
      await page.fill("#password", opts.password);
      const nav = page
        .waitForURL(APP_HOST_RE, { timeout: 60000 })
        .catch(() => undefined);
      // Auth0's primary button is type=submit; fall back to name=action.
      await page
        .click("button[type=submit]")
        .catch(() => page.click("button[name=action]"));
      await nav;
    }

    await page
      .waitForLoadState("networkidle", { timeout: 30000 })
      .catch(() => undefined);

    if (LOGIN_HOST_RE.test(page.url())) {
      throw new Error(
        "Login did not complete — still on the Auth0 login page. " +
          "Likely wrong credentials, MFA, or a CAPTCHA. Retry with headless=false to solve it interactively."
      );
    }

    const cookies = (await ctx.cookies()).filter((c) =>
      c.domain.includes("usta.com")
    );
    if (cookies.length === 0) {
      throw new Error("Login appeared to succeed but no usta.com cookies were captured.");
    }
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const userAgent = (await page.evaluate(
      "navigator.userAgent"
    )) as string;

    return {
      cookieHeader,
      userAgent,
      contactEmail: opts.contactEmail,
      fetchedAt: new Date().toISOString(),
      note: "auto-login",
    };
  } finally {
    await browser.close();
  }
}

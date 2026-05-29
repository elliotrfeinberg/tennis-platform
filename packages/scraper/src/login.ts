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
    // Auth-walled → redirect chain to Auth0. Wait for the form to hydrate
    // rather than racing the fill against the redirects.
    await page
      .waitForLoadState("networkidle", { timeout: 30000 })
      .catch(() => undefined);

    const userField = page.locator("#username");
    try {
      await userField.waitFor({ state: "visible", timeout: 30000 });
    } catch {
      throw new Error(
        `Auth0 username field not found. Landed on ${page.url()} ` +
          `(title: "${await page.title().catch(() => "?")}"). ` +
          `If this is a CAPTCHA/bot challenge, retry with --headed to solve it.`
      );
    }

    await userField.fill(opts.username);
    const passField = page.locator("#password");
    await passField.fill(opts.password);
    const nav = page
      .waitForURL(APP_HOST_RE, { timeout: 60000 })
      .catch(() => undefined);
    // Submit via Enter — robust to Auth0's submit-button markup (the button
    // often lacks an explicit type=submit attribute). Click the primary
    // action button as a fallback.
    await passField.press("Enter");
    await page
      .locator("button[name=action], button[type=submit]")
      .first()
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await nav;

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

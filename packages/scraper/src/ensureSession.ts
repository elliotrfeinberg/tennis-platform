// Auto-refreshing session: probe the stored session and, if it's missing or
// expired (auth-walled URL bounces to login), re-run the Playwright login for
// the account and persist a fresh session. Long-running workflows call this
// at startup so a soon-to-expire cookie gets renewed before the crawl.

import { PoliteFetcher } from "./politeFetch.js";
import {
  loadSession,
  defaultSessionPath,
  sessionPathForAccount,
  writeSession,
  SessionMissingError,
  LoginRequiredError,
  type UstaSession,
} from "./session.js";
import { loadAccount } from "./accounts.js";
import { loginAndCaptureSession } from "./login.js";

const PROBE_URL =
  "https://tennislink.usta.com/Leagues/Main/StatsAndStandings.aspx" +
  "?t=3&par1=0000000000000000000000000000000000000000000&par2=2026&par3=0";

function looksLikeLogin(body: string | null): boolean {
  if (!body) return false;
  return (
    body.includes("account.usta.com") ||
    body.includes("Auth0") ||
    body.includes("Sign in to TennisLink")
  );
}

// True if the session still authenticates (a non-login response from an
// auth-walled URL).
export async function sessionIsValid(session: UstaSession): Promise<boolean> {
  const fetcher = new PoliteFetcher({
    userAgent: session.userAgent,
    contactEmail: session.contactEmail,
    cookieHeader: session.cookieHeader,
  });
  try {
    const res = await fetcher.fetch(PROBE_URL);
    return !looksLikeLogin(res.body);
  } catch (err) {
    if (err instanceof LoginRequiredError) return false;
    throw err;
  }
}

export interface EnsureSessionResult {
  session: UstaSession;
  refreshed: boolean;
}

// Return a valid session for the account, logging in again if needed.
// Without an account we can't auto-login (no creds) — we surface the
// expiry so the caller can refresh manually.
export async function ensureSession(opts: {
  account?: string;
  headless?: boolean;
  forceRefresh?: boolean;
} = {}): Promise<EnsureSessionResult> {
  const path = opts.account
    ? sessionPathForAccount(opts.account)
    : defaultSessionPath();

  let existing: UstaSession | undefined;
  if (!opts.forceRefresh) {
    try {
      existing = await loadSession(path);
    } catch (err) {
      if (!(err instanceof SessionMissingError)) throw err;
    }
    if (existing && (await sessionIsValid(existing))) {
      return { session: existing, refreshed: false };
    }
  }

  if (!opts.account) {
    throw new Error(
      "Session is missing or expired and no account was given for auto-login. " +
        "Set TENNIS_ACCOUNT and run `session login <account>`, or refresh the session file manually."
    );
  }

  const creds = await loadAccount(opts.account);
  const contactEmail =
    creds.contactEmail ??
    process.env.TENNIS_CONTACT_EMAIL ??
    existing?.contactEmail;
  if (!contactEmail) {
    throw new Error(
      `No contactEmail for account "${opts.account}" and TENNIS_CONTACT_EMAIL is unset.`
    );
  }
  const fresh = await loginAndCaptureSession({
    username: creds.username,
    password: creds.password,
    contactEmail,
    headless: opts.headless,
  });
  await writeSession(fresh, path);
  return { session: fresh, refreshed: true };
}

// USTA TennisLink session management.
//
// Auth-walled pages (team rosters, schedules, scorecards) require a logged-
// in USTA session. We don't run our own login flow — too brittle against
// Auth0 changes and 2FA. Instead the user logs in via their browser once,
// then copies the request Cookie header into a local file. We read it and
// send it back on every scrape request.
//
// The session file lives at ~/.tennis-platform/usta-session.json by default
// (overridable via env). The file is plain JSON so editing it later — to
// refresh expired cookies — is trivial.
//
// Format:
//   {
//     "cookieHeader": "ASP.NET_SessionId=...; ai_user=...; ...",
//     "userAgent":    "Mozilla/5.0 ... (real browser UA, paired with cookies)",
//     "contactEmail": "you@example.com",
//     "fetchedAt":    "2026-05-26T12:00:00Z",
//     "note":         "optional free-form note"
//   }
//
// Cookies expire (USTA's Auth0 session is typically ~24h, the ASP.NET
// session somewhat longer). On a 302 to the login page, we throw
// LoginRequiredError so the caller can prompt the user to refresh.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UstaSession {
  cookieHeader: string;
  userAgent: string;
  contactEmail: string;
  fetchedAt: string;
  note?: string;
}

export class LoginRequiredError extends Error {
  constructor(public readonly url: string) {
    super(
      `Auth-walled URL redirected to login: ${url}\n` +
        `Your USTA session cookies are missing or expired. Refresh them with:\n` +
        `  - In a browser, log in to https://tennislink.usta.com/leagues/\n` +
        `  - Open devtools > Network > click any request > Headers > copy the\n` +
        `    Cookie request header value verbatim into your session file.`
    );
    this.name = "LoginRequiredError";
  }
}

export class SessionMissingError extends Error {
  constructor(public readonly path: string) {
    super(
      `No USTA session file at ${path}\n` +
        `Run 'tennis-scrape session init' to create a template.`
    );
    this.name = "SessionMissingError";
  }
}

// Per-account session file, e.g. ~/.tennis-platform/sessions/norcal.json.
// Each section/district runs under its own account + session so workflows
// can run in parallel without sharing (or burning) one login.
export function sessionPathForAccount(account: string): string {
  return join(homedir(), ".tennis-platform", "sessions", `${account}.json`);
}

// Resolution precedence:
//   1. TENNIS_SESSION_FILE (explicit path override)
//   2. TENNIS_ACCOUNT      (→ sessions/{account}.json)
//   3. the legacy single-session path
// This makes every command account-aware just by setting TENNIS_ACCOUNT.
export function defaultSessionPath(): string {
  const envPath = process.env.TENNIS_SESSION_FILE;
  if (envPath) return envPath;
  const account = process.env.TENNIS_ACCOUNT;
  if (account) return sessionPathForAccount(account);
  return join(homedir(), ".tennis-platform", "usta-session.json");
}

// Persist a session file (mode 0600 — it holds auth cookies).
export async function writeSession(
  session: UstaSession,
  path: string = defaultSessionPath()
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function loadSession(
  path: string = defaultSessionPath()
): Promise<UstaSession> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SessionMissingError(path);
    }
    throw err;
  }
  const parsed = JSON.parse(raw) as Partial<UstaSession>;
  for (const required of ["cookieHeader", "userAgent", "contactEmail"] as const) {
    if (!parsed[required] || typeof parsed[required] !== "string") {
      throw new Error(
        `Session file ${path} is missing required field "${required}"`
      );
    }
  }
  return {
    cookieHeader: parsed.cookieHeader!,
    userAgent: parsed.userAgent!,
    contactEmail: parsed.contactEmail!,
    fetchedAt: parsed.fetchedAt ?? new Date().toISOString(),
    note: parsed.note,
  };
}

// Write a template session file with empty/placeholder values, plus a
// pointer at how to populate it. Refuses to overwrite an existing file.
export async function initSessionTemplate(
  path: string = defaultSessionPath()
): Promise<{ path: string; created: boolean }> {
  try {
    await readFile(path, "utf8");
    return { path, created: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const template: UstaSession & { _instructions: string[] } = {
    cookieHeader: "",
    userAgent: "",
    contactEmail: process.env.TENNIS_CONTACT_EMAIL ?? "",
    fetchedAt: new Date().toISOString(),
    _instructions: [
      "1. Open https://tennislink.usta.com/leagues/ in a browser and log in.",
      "2. Open devtools > Network. Click any tennislink.usta.com request.",
      "3. Under 'Request Headers', copy the full value of the Cookie: header.",
      "4. Paste that value as the cookieHeader field above.",
      "5. From the same Request Headers panel copy your User-Agent value into userAgent.",
      "6. Fill in contactEmail so site admins can reach you.",
      "7. Delete this _instructions field, then run 'tennis-scrape session check'.",
    ],
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(template, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return { path, created: true };
}

// Heuristics for detecting an auth-wall response without parsing the body.
// Either a 302 to Login.aspx / account.usta.com, or a 200 page that smells
// like a login page (rare but possible — some IdPs return 200 with a meta
// refresh).
export function isLoginRedirect(
  status: number,
  locationHeader: string | undefined
): boolean {
  if (status !== 302 && status !== 301) return false;
  if (!locationHeader) return false;
  const lower = locationHeader.toLowerCase();
  return (
    lower.includes("/dashboard/main/login.aspx") ||
    lower.includes("account.usta.com")
  );
}

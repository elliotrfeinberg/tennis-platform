// Credential store for the per-section/district bot accounts used to run
// scrapes in parallel. Plain JSON at ~/.tennis-platform/accounts.json
// (mode 0600, gitignored). Maps an account name → login + metadata.
//
//   {
//     "norcal": {
//       "username": "norcal-bot@example.com",
//       "password": "…",
//       "section": "USTA/NO. CALIFORNIA",
//       "district": "NO. CALIFORNIA",
//       "contactEmail": "you@example.com"
//     }
//   }
//
// SECURITY: passwords live in plaintext here. Keep the file 0600 and out of
// git; consider the OS keychain later.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface AccountCredentials {
  username: string;
  password: string;
  section?: string;
  district?: string;
  contactEmail?: string;
}

export function accountsPath(): string {
  return (
    process.env.TENNIS_ACCOUNTS_FILE ??
    join(homedir(), ".tennis-platform", "accounts.json")
  );
}

async function readAccounts(): Promise<Record<string, AccountCredentials>> {
  const path = accountsPath();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No accounts file at ${path}. Run 'tennis-scrape session accounts-init' to create a template.`
      );
    }
    throw err;
  }
  return JSON.parse(raw) as Record<string, AccountCredentials>;
}

export async function loadAccount(
  account: string
): Promise<AccountCredentials> {
  const map = await readAccounts();
  const creds = map[account];
  if (!creds) {
    throw new Error(
      `No account "${account}" in ${accountsPath()}. Known accounts: ${
        Object.keys(map).join(", ") || "(none)"
      }`
    );
  }
  if (!creds.username || !creds.password) {
    throw new Error(`Account "${account}" is missing username/password.`);
  }
  return creds;
}

export async function listAccounts(): Promise<string[]> {
  try {
    return Object.keys(await readAccounts());
  } catch {
    return [];
  }
}

// Write a template accounts file. Refuses to overwrite an existing one.
export async function initAccountsTemplate(): Promise<{
  path: string;
  created: boolean;
}> {
  const path = accountsPath();
  try {
    await readFile(path, "utf8");
    return { path, created: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const template: Record<string, AccountCredentials> = {
    "example-account": {
      username: "bot@example.com",
      password: "REPLACE_ME",
      section: "USTA/NO. CALIFORNIA",
      district: "NO. CALIFORNIA",
      contactEmail: process.env.TENNIS_CONTACT_EMAIL ?? "you@example.com",
    },
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(template, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return { path, created: true };
}

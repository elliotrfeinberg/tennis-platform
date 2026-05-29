// Server-side loader for perf-ratings JSON files emitted by
// `tennis-scrape ratings fit --model perf`.
//
// The CLI writes its output to {captures-dir}/parsed/{stem}.perf-ratings.json
// with one entry per player and the full chronological match history
// embedded. We default to the most recent multi-band fit; override via
// TENNIS_PERF_RATINGS_PATH for other datasets.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PerfMatchPlayerRef {
  key: string;
  name: string;
  // The player/opponent/partner's rolling rating going INTO this match.
  preRating: number;
}

export interface PerfMatchEntry {
  matchId: string;
  date: string; // YYYY-MM-DD
  won: boolean;
  kind: "S" | "D";
  line: number;
  playerTeamName: string;
  opponentTeamName: string;
  sets: Array<{ playerGames: number; opponentGames: number }>;
  gamesDiff: number;
  opponents: PerfMatchPlayerRef[];
  partners: PerfMatchPlayerRef[];
  opponentMean: number;
  teamPerf: number;
  perf: number;
  playerPreRating: number;
  playerPostRating: number;
  category: "adult" | "mixed" | "combo" | "other";
  affectsRating: boolean;
  perfBasis: "adult" | "mixed";
}

export interface PerfRatingEntry {
  key: string;
  name: string | undefined;
  memberId: string | undefined;
  ntrpLabel: number | undefined;
  teams: string[];
  // Display rating: adult ?? mixed. Back-compat field for pages that
  // just want one number.
  perfRating: number | null;
  adultRating: number | null;
  mixedRating: number | null;
  adultMatches: number;
  mixedMatches: number;
  otherMatches: number;
  matches: number;
  history: PerfMatchEntry[];
}

const DEFAULT_REL_PATH =
  "apps/worker/captures/parsed/5083143679-subflight/2026-05-28T03-28-44-219Z.perf-ratings.json";

function resolveRatingsPath(): string {
  const override = process.env.TENNIS_PERF_RATINGS_PATH;
  if (override) return override;
  return join(process.cwd(), "..", "..", DEFAULT_REL_PATH);
}

let cached: { path: string; entries: PerfRatingEntry[] } | undefined;

// Backfill fields added in the per-category refactor so the UI works
// with both old and new perf-ratings JSON files. Old files have only
// `perfRating` + `matches`; new files also have `adultRating`,
// `mixedRating`, per-category counts, and per-entry `category` /
// `affectsRating` / `perfBasis`.
function normalize(raw: Record<string, unknown>): PerfRatingEntry {
  const entry = raw as PerfRatingEntry & Record<string, unknown>;
  // Top-level rating fields.
  if (!("adultRating" in raw)) entry.adultRating = entry.perfRating ?? null;
  if (!("mixedRating" in raw)) entry.mixedRating = null;
  if (!("adultMatches" in raw)) entry.adultMatches = entry.matches ?? 0;
  if (!("mixedMatches" in raw)) entry.mixedMatches = 0;
  if (!("otherMatches" in raw)) entry.otherMatches = 0;
  // Per-history-entry fields.
  if (Array.isArray(entry.history)) {
    for (const h of entry.history as unknown as Array<Record<string, unknown>>) {
      if (!("category" in h)) h["category"] = "adult";
      if (!("affectsRating" in h)) h["affectsRating"] = true;
      if (!("perfBasis" in h)) h["perfBasis"] = "adult";
    }
  }
  return entry;
}

export async function loadPerfRatings(): Promise<{
  path: string;
  entries: PerfRatingEntry[];
}> {
  const path = resolveRatingsPath();
  if (cached && cached.path === path) return cached;
  const text = await readFile(path, "utf8");
  const raw = JSON.parse(text) as Array<Record<string, unknown>>;
  const entries = raw.map(normalize);
  cached = { path, entries };
  return cached;
}

// Resolve a URL-safe player key from a key that might contain slashes,
// "name:" prefixes, etc. Players with numeric memberId use that
// directly; name-keyed players use a base64url of the original key.
export function playerSlug(key: string): string {
  if (/^\d+$/.test(key)) return key;
  return Buffer.from(key, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function unslug(slug: string): string {
  if (/^\d+$/.test(slug)) return slug;
  // Restore base64 padding + alphabet, then decode.
  const padded = slug.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf8");
}

export async function findPlayerBySlug(
  slug: string
): Promise<PerfRatingEntry | undefined> {
  const data = await loadPerfRatings();
  const key = unslug(slug);
  return data.entries.find((e) => e.key === key);
}

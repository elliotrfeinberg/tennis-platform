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
}

export interface PerfRatingEntry {
  key: string;
  name: string | undefined;
  memberId: string | undefined;
  ntrpLabel: number | undefined;
  teams: string[];
  perfRating: number;
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

export async function loadPerfRatings(): Promise<{
  path: string;
  entries: PerfRatingEntry[];
}> {
  const path = resolveRatingsPath();
  if (cached && cached.path === path) return cached;
  const text = await readFile(path, "utf8");
  const entries = JSON.parse(text) as PerfRatingEntry[];
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

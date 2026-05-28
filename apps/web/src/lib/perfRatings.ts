// Server-side loader for perf-ratings JSON files emitted by
// `tennis-scrape ratings fit --model perf`.
//
// The CLI writes its output to {captures-dir}/parsed/{stem}.perf-ratings.json
// with one entry per player. We hard-code a default path here that
// points at the most recent multi-band fit; override via the
// TENNIS_PERF_RATINGS_PATH environment variable for other deployments.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PerfRatingEntry {
  key: string;
  name: string | undefined;
  memberId: string | undefined;
  ntrpLabel: number | undefined;
  teams: string[];
  perfRating: number;
  matches: number;
  recentMatches: Array<{
    date: string;
    perf: number;
    opponent: number;
    gamesDiff: number;
  }>;
}

// Default path: points at the 3-band NorCal Women's Adult 18+ fit
// produced by `pnpm dev ratings fit --model perf`. Override via
// TENNIS_PERF_RATINGS_PATH for other datasets.
const DEFAULT_REL_PATH =
  "apps/worker/captures/parsed/5083143679-subflight/2026-05-28T03-28-44-219Z.perf-ratings.json";

function resolveRatingsPath(): string {
  const override = process.env.TENNIS_PERF_RATINGS_PATH;
  if (override) return override;
  // Walk up from cwd looking for the monorepo root (has apps/worker).
  // In `next dev` the cwd is typically the apps/web dir, so we hop up.
  // We don't bother with fancy discovery here — the override env var is
  // the production-friendly path.
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

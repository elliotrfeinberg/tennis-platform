# Tennis Platform

Daily-updated estimated NTRP ratings for USTA league players, plus captain
tools for lineup optimization and match-win prediction.

Working name; final branding TBD.

## What this is

A reimagining of [tennisrecord.com](https://www.tennisrecord.com) with three
changes that matter to actual players and captains:

1. **Daily rating updates** instead of monthly. Match data hits tennislink
   within hours; there's no technical reason to wait a month.
2. **Lineup optimizer for captains.** Given your roster, opponent roster, and
   availability, what's the lineup that maximizes your team's win probability?
3. **Per-court win probability** with confidence intervals — so captains can
   see *why* a lineup is favored, not just that it is.

Ratings are **estimated**, not official. The USTA's algorithm is proprietary;
this is a Glicko-2 model calibrated against year-end NTRP levels using 2-3
years of historical tennislink data, so it ships pre-calibrated (no cold-start
season).

## Architecture

Monorepo, pnpm + turbo.

```
apps/
  web/        Next.js 15 — search, profiles, team pages, captain workspace
  mobile/     Expo — deferred to v2
packages/
  ratings/    Glicko-2 rating engine + NTRP calibration
  optimizer/  Win-probability model + lineup search
  scraper/    Polite tennislink crawler (rate-limited, ETag-cached)
  db/         Drizzle (Postgres) schema and migrations
  shared/     Cross-package types
```

## Status

Scaffolding in progress. See open issues for the build plan.

## Legal note

This project is not affiliated with the USTA. Ratings shown are estimates
derived from publicly visible league match scores. We crawl politely
(rate-limited, robots.txt-aware, identifying UA) and cache aggressively. If
USTA asks us to change anything, we will.

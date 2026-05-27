# Tennis Platform

Estimated NTRP ratings for USTA league players, plus captain tools for
lineup optimization and per-court win probability.

Working name; final branding TBD.

## What this is

A reimagining of [tennisrecord.com](https://www.tennisrecord.com) with three
changes that matter to actual players and captains:

1. **Faster rating updates** than the official monthly cycle. As soon as
   match data is in hand, ratings refresh.
2. **Lineup optimizer for captains.** Given your roster, opponent roster,
   and availability, what's the lineup that maximizes your team's *match*
   win probability (not just sum of court odds)?
3. **Per-court win probability with confidence intervals** — so captains
   can see *why* a lineup is favored, not just that it is.

Ratings are **estimated**, not official. USTA's NTRP algorithm is
proprietary; this is a Glicko-2 model with a fitted linear map to the
NTRP scale (slope/intercept refit nightly once we have real labels).

## Status

Pre-MVP. The web app runs end-to-end against an in-memory fixture league
(one 4.0 men's league, 6 teams, 60 players, mid-season). Optimizer and
rating engine are functional and tested. The data-ingest path is in flux —
see [Data source](#data-source) below.

What works today:
- `/` — marketing page
- `/players`, `/players/[id]` — search + profile with est-NTRP history chart
- `/teams`, `/teams/[id]` — standings + roster + schedule
- `/captain` — pick your team and an upcoming match, mark unavailable
  players, see top 3 lineups ranked by team win probability

## Architecture

Monorepo, pnpm + turbo. All workspace packages point at their TypeScript
sources directly (no per-package `pnpm build` needed during development —
`tsx` and Next.js webpack both transpile on demand).

```
apps/
  web/        Next.js 15 — search, profiles, team pages, captain workspace
  worker/     CLI for ad-hoc fetches and HTML parsing
packages/
  ratings/    Glicko-2 rating engine + NTRP calibration
  optimizer/  Win-probability model + lineup search
  fixtures/   In-memory demo league (deterministic match + rating history)
  scraper/    Public NTRP rating-lookup helpers (limited scope; see below)
  db/         Drizzle (Postgres) schema and migrations
```

## Data source

Research established that the data we actually need — team rosters,
schedules, match scorecards, individual player match history — lives
behind USTA Auth0 login on `tennislink.usta.com/Leagues/Main/*`. Only the
public NTRP rating-lookup pages (`/leagues/reports/NTRP/*`) are accessible
unauthenticated, and even those use ASP.NET WebForms postbacks
(`__VIEWSTATE` + `__EVENTVALIDATION`) so a simple GET won't return results.

Two paths under consideration:

1. **USTA Connect partner API** — official, OAuth2, free for vetted
   partners. Email `worldtennisnumber@usta.com` to apply. Right long-term
   answer. Approval is not guaranteed.
2. **Authenticated scraping** — user supplies their own USTA session
   cookies; the scraper fetches what they can see when logged in. TOS-
   fragile but viable for a self-hosted MVP.

The current `@tennis/scraper` package is trimmed to a stub for the public
NTRP-only path. Real ingest is not yet wired.

## Getting started

Prereqs:
- Node.js 20.11+
- pnpm 9.12.0 (pinned via `packageManager` in `package.json`)

```bash
# Install pnpm if you don't have it (or use `npx pnpm` everywhere)
npm i -g pnpm@9.12.0

git clone <repo>
cd tennis-platform
pnpm install
```

### Run the web app

```bash
pnpm --filter @tennis/web dev
# open http://localhost:3000
```

Pages worth visiting: `/`, `/players`, `/teams`, `/captain`. The whole
demo runs on fixture data — no database, no API access, no env vars.

### Typecheck and test

```bash
pnpm -r typecheck            # whole workspace
pnpm -r test                 # all vitest suites (37 tests across 5 packages)

pnpm --filter @tennis/optimizer test       # just one package
pnpm --filter @tennis/fixtures test:watch  # watch mode for one package
```

### Worker CLI

The worker has subcommands for capturing and parsing HTML during scraper
development. All commands require `TENNIS_CONTACT_EMAIL`, which is
identified to remote hosts in the User-Agent so site admins can reach you.

```bash
export TENNIS_CONTACT_EMAIL="you@example.com"

# Fetch one URL through the rate-limited PoliteFetcher
pnpm --filter @tennis/worker exec tennis-scrape capture <url> out.html

# Run a parser on captured HTML
pnpm --filter @tennis/worker exec tennis-scrape parse search out.html
pnpm --filter @tennis/worker exec tennis-scrape parse robots robots.txt

# Sanity-check robots.txt for a host
pnpm --filter @tennis/worker exec tennis-scrape robots tennislink.usta.com
```

### Database

The schema lives in `@tennis/db` and uses Drizzle migrations. Not required
to run the demo. When you do want a local Postgres for ingest:

```bash
pnpm --filter @tennis/db generate    # generate migrations from schema.ts
pnpm --filter @tennis/db migrate     # apply migrations
pnpm --filter @tennis/db studio      # browse the db
```

## Project memory

Claude Code sessions on this project share a small memory file at
`~/.claude/projects/-Users-elliotfeinberg-tennis-platform/memory/`. The
current data-source decision is captured there so context isn't lost
between sessions.

## Legal note

This project is not affiliated with the USTA. Estimated ratings are
derived from league match scores. If we end up scraping, we crawl
politely (rate-limited, robots.txt-aware, identifying UA), cache
aggressively (ETag + If-None-Match), and stop on request from site admins.

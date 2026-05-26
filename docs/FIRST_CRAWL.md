# First crawl: getting data into the system

This doc walks you through doing the initial tennislink capture from your
local machine and tuning the parsers against real HTML.

## Why local

The polite-crawler scraper is fully built (`packages/scraper`), but
tennislink isn't reachable from CI / our cloud Claude environment — and
even if it were, the first crawl should be done from an IP that's clearly
a developer machine, not a datacenter.

## Why scraping at all (vs. an API)

We researched this. No public API exposes USTA league match data:

- **USTA Connect API** (the official one) is a vetted partner program.
  Open to companies with established user bases serving tennis.
  Worth applying once we have one. Email `ustaconnect@usta.com`.
- **UTR Engage API** ingests USTA league scores but exposes UTR ratings
  not raw NTRP/scores. $250 app fee, partner-only. Wrong shape.
- **SportsDataIO, api-tennis.com, RapidAPI tennis APIs**: pro tennis
  only (ATP/WTA/ITF). No USTA amateur coverage.
- **ACTIVE Network Activity Search API v2**: historical, effectively dead.

Every existing NTRP-estimation site (TennisRecord, Schmidt Computer
Ratings, TLA, MyTennisRatings) scrapes tennislink. Same posture.

## Prerequisites

```bash
node --version  # >= 20.11
pnpm --version  # >= 9
```

```bash
pnpm install
pnpm --filter @tennis/scraper build
pnpm --filter @tennis/worker build
```

Set your contact email (so site admins can reach you if our crawler
causes any trouble):

```bash
export TENNIS_CONTACT_EMAIL="you@example.com"
```

## Step 1: read robots.txt

```bash
pnpm --filter @tennis/worker dev robots tennislink.usta.com
pnpm --filter @tennis/worker dev robots m.tennislink.usta.com
```

Note any `Disallow:` rules. We respect them. Try the mobile site too —
USTA's TennisLink iOS/Android app talks to `m.tennislink.usta.com` which
sometimes serves cleaner HTML than the desktop site.

## Step 2: capture a few pages

We prefer the **mobile site** (`m.tennislink.usta.com`) wherever possible —
it's what USTA's TennisLink iOS/Android app talks to, and tends to serve
cleaner HTML than the desktop site.

Look up a real player ID first: open the rating search in a browser, find a
player you know, note the `par1=` value in the resulting URL (it's a
numeric string like `2006671136`).

```bash
# Rating search (mobile)
pnpm --filter @tennis/worker dev capture \
  "https://m.tennislink.usta.com/ntrp/advancedsearch.aspx?lastName=Smith" \
  packages/scraper/src/__fixtures__/search.html

# Player's match history (mobile) — replace par1 with a real id
pnpm --filter @tennis/worker dev capture \
  "https://m.tennislink.usta.com/statsandstandings/statsandstandings.aspx?t=0&par1=2006671136" \
  packages/scraper/src/__fixtures__/player-history.html

# Team page (desktop — no clean mobile equivalent)
# TeamCode comes from the team's URL on tennislink; CYear is the league year.
pnpm --filter @tennis/worker dev capture \
  "https://tennislink.usta.com/LEAGUES/Reports/TennisLinkReports.aspx?Level=T&TeamCode=YOUR_TEAM_CODE&CYear=2025" \
  packages/scraper/src/__fixtures__/team.html
```

If you get a 404, the page genuinely doesn't exist for that ID — open the
URL in a browser to verify, then adjust.

## Step 3: inspect + tune the parsers

```bash
pnpm --filter @tennis/worker dev parse search \
  packages/scraper/src/__fixtures__/search.html
```

If the output is empty or wrong, open the HTML file and update the
selectors in `packages/scraper/src/parse.ts`. Then re-run `parse` —
no need to re-hit tennislink while iterating.

## Step 4: lock in regressions

Once the parser produces what you want, commit the fixtures and add a
test that loads each fixture and asserts on a known row count + spot-
checks (e.g., a specific player's section, a specific match's score).
This way a tennislink layout change shows up as a red CI build.

## Polite-crawl etiquette

The fetcher already does this, but in case you customize:

- One in-flight request per host (serialized in a queue).
- 2-5s jittered delay between requests.
- Honors 429 and 5xx with exponential backoff.
- Sends `User-Agent: TennisPlatform/0.1 (+contact: <your email>)`.
- Sends `If-None-Match` / `If-Modified-Since` so re-crawls of unchanged
  pages return 304 — near-free.

If a USTA admin reaches out asking us to change anything, change it.

## What's not built yet

- The full ingest pipeline (capture → parse → write to db). Coming after
  selectors are confirmed against real HTML.
- Backfill mode (walk historical seasons by section).
- Nightly cron that picks up new matches and re-runs the rating engine.

# MatchMetric — agent notes

USTA NorCal tennis-rating platform. pnpm + Turbo monorepo: `apps/web`
(Next.js 15), `apps/worker` (crawler/CLI, `tennis-scrape`), `packages/*`
(`db`, `scraper`, `calibrate`, `ratings`, `optimizer`, `fixtures`). Postgres 16
via standalone `docker-compose` (the `tennis-postgres` container), Drizzle ORM.

Local DB URL: `postgres://tennis:tennis@localhost:5432/tennis` (also in `.env`).

## Dev workflow

- The **user runs the web dev server** themselves (`localhost:3000`). Do NOT
  start/restart/kill it. To validate web changes use `pnpm --filter @tennis/web
  typecheck`; a one-off `curl` is fine if the server is already up. Never run
  `next build` while their dev server is up — it clobbers the shared `.next`.
- Commit/push only when asked.

## Data pipeline ops

The match data flows: **enumerate flights → backfill scorecards → normalize →
compute ratings**. A wide crawl runs detached for days (rate-limited); the
derived tables (`court_matches`, `perf_match_results`, `player_perf_ratings`)
only refresh when `normalize` + `compute-ratings --persist` run.

All commands assume `DATABASE_URL` is exported (or in `.env`) and run from the
repo root.

### Launch the full backfill pipeline (detached)

```bash
# resumable; retries each step; survives shell exit + harness reaping
( nohup bash scripts/pipeline.sh > /tmp/tennis-pipeline.log 2>&1 < /dev/null & )
```

### Check status

```bash
# is it alive?
ps aux | grep -E "backfill-scorecards|enumerate-flights|tennis-scrape" | grep -v grep
# progress + recent step transitions / errors
tail -n 6 /tmp/tennis-pipeline.log
grep -c "exited non-zero" /tmp/tennis-pipeline.log     # crash-loop count

# coverage snapshot
docker exec tennis-postgres psql -U tennis -d tennis -t -A -F'|' -c "
select 'raw_scorecards', count(*) from raw_scorecards
union all select 'fm_2026_fetched', count(*) from flight_matches where year=2026 and scorecard_fetched
union all select 'fm_2026_due_unfetched', count(*) from flight_matches where year=2026 and not scorecard_fetched and played_on <= now()
union all select 'fm_2025_fetched', count(*) from flight_matches where year=2025 and scorecard_fetched
union all select 'court_matches', count(*) from court_matches
union all select 'perf_ratings', count(*) from player_perf_ratings;"
```

### Recompute ratings from what's already fetched (no full crawl)

Stages 3–4 only *read* the staged scorecards, so they're safe to run anytime —
even while a backfill is running — to surface partial progress on the site.
`compute-ratings --persist` is a full, idempotent replace.

```bash
cd apps/worker
export DATABASE_URL='postgres://tennis:tennis@localhost:5432/tennis'
node_modules/.bin/tsx src/cli.ts db normalize-matches
node_modules/.bin/tsx src/cli.ts db compute-ratings --persist
```

### Scheduled daily delta (production)

`scripts/incremental.sh` (wraps `db incremental`) + `scripts/crontab.example`
or the launchd plist. See `docs/DEPLOYMENT.md`.

## Pointers

- `README.md` — setup + the four-stage pipeline reference.
- `docs/DEPLOYMENT.md` — hosting plan (Vercel + Neon + local/Oracle worker).
- `docs/ROADMAP.md` — feature roadmap.
- Credentials live in `~/.tennis-platform/` (accounts.json mode 0600), OUTSIDE
  git. Never commit secrets.

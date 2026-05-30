# Deployment & Hosting Plan

How MatchMetric goes from "running on Elliot's Mac" to a public, scalable site —
**free now, paid only when growth forces it.** Each stage below is a discrete,
reversible step; you never have to do them all at once.

---

## The shape of the problem

MatchMetric is really **three deployables** with very different hosting needs.
You can host each on a different provider and swap any one out without touching
the others — they only share a `DATABASE_URL`.

```
   ┌─ Frontend (Next.js 15) ─┐
   │   SSR + server compts    ├──► Postgres ◄──┐
   └──────────────────────────┘                │
                                                │
   ┌─ Worker (Playwright crawler) ──────────────┘
   │   multi-hour paced crawl + daily cron
   └─────────────────────────────────────────────
```

| Piece | What it needs | Hosting difficulty |
|---|---|---|
| **Frontend** — `apps/web` | Node runtime (opens Postgres TCP from server components via `postgres-js`), SSR, custom domain | **Easy** — many free tiers |
| **Postgres** — 97 MB today, → 1–3 GB | Always-queryable, **no hard-pause / no auto-delete** | **Easy** — good free tiers |
| **Worker** — `apps/worker` | ≥1 GB RAM, **always-on (no sleep)**, full headless Chromium, small persistent session files, **clean outbound IP reputation** | **Hard** — the whole ballgame |

### Why the worker is special (read this before choosing a host)

The crawler drives **headless Chromium via Playwright** for hours at a time with
detection-evasion pacing. That rules out the easy "just deploy to Vercel"
answer, for three independent reasons:

1. **Serverless can't run it.** Vercel/Netlify/Cloudflare functions cap out at
   60–900 s. A multi-hour crawl needs a process that stays alive — a VM or a
   long-lived container, not a function.
2. **It needs real RAM.** One headless Chromium peaks at **~700 MB**; you want
   **≥1 GB, ideally 2 GB**. This kills every 512 MB free tier (Railway free,
   Koyeb free) — they OOM mid-crawl.
3. **⚠️ The compute-vs-IP-reputation conflict.** The best *free compute* box
   (Oracle Cloud Always Free: 4 ARM cores / 24 GB / $0 forever) sits on an ASN
   that anti-bot systems **aggressively blocklist for scraping** — operators
   block the entire Oracle range. The big-3 (AWS/GCP/Azure) are pre-flagged too.
   **There is no datacenter IP with "good" scraping reputation** — that's a
   property of residential/home IPs. On top of that, USTA TennisLink sessions
   are auth-walled and may be **IP-bound** (a cookie minted at your home IP can
   be rejected when replayed from a datacenter), and login occasionally needs a
   **headful CAPTCHA/MFA** solve.

   **Conclusion:** the crawler is happiest staying on your **home IP**. So the
   recommended free architecture keeps the worker local and only moves the
   stateless frontend + DB to the cloud.

---

## Cost trajectory at a glance

| Stage | Frontend | Postgres | Worker | $/mo |
|---|---|---|---|---|
| **0 — Free (recommended now)** | Vercel Hobby | Neon free | **local (your Mac)** | **$0** |
| **1 — DB outgrows 0.5 GB** | Vercel Hobby | Neon Launch *(or Xata free 15 GB)* | local | **~$5 (or $0)** |
| **2 — Worker off your machine** | Vercel | Neon | Oracle Always Free *(+ maybe proxy)* | **~$0–5** |
| **3 — Monetized / real traffic** | Vercel Pro | Neon Launch | Fly.io / Oracle | **~$25–30** |

---

## Stage 0 — The free path (do this now)

**Architecture:** Vercel Hobby (web) + Neon (Postgres) + worker stays local,
pointed at Neon.

This gives you a public, scalable site at **$0**, keeps the scraper on the one
IP least likely to be blocked, and requires no code changes (the app already
reads `DATABASE_URL` from the environment, and the db client uses
`prepare: false`, which is exactly what Neon's pooled endpoint wants).

### 0a. Postgres → Neon (free)

1. Create a project at **neon.tech** → New Project → Postgres 16, region close
   to you (e.g. `us-west-2`).
2. Copy **two** connection strings from the dashboard:
   - **Pooled** (host contains `-pooler`) → for the web app (serverless-safe).
   - **Direct** (no `-pooler`) → for migrations and the worker.
3. Run the schema migration against Neon, then optionally copy your local data:
   ```bash
   # from repo root — uses the helper added in this repo
   DATABASE_URL='<neon-DIRECT-url>' ./scripts/migrate-to-neon.sh
   # add --with-data to also copy the current local DB contents up
   DATABASE_URL='<neon-DIRECT-url>' ./scripts/migrate-to-neon.sh --with-data
   ```
   > Notes on the free tier: storage cap is **0.5 GB** (you're at ~0.1 GB).
   > Compute scale-to-zero wakes sub-second and your daily worker keeps it warm
   > — **no pause, no auto-delete** (unlike Render's 30-day delete or Supabase's
   > 7-day pause). When scorecards push you past 0.5 GB, see **Stage 1**.

### 0b. Frontend → Vercel Hobby (free)

1. Push the repo to GitHub, then **vercel.com** → New Project → import it.
2. The repo includes a root **`vercel.json`** that handles the pnpm monorepo
   (installs the workspace, builds `@tennis/web`, output at `apps/web/.next`).
   Leave the framework preset on **Next.js**; no Root Directory override needed.
3. Add an env var: `DATABASE_URL` = the Neon **pooled** URL.
4. Deploy. Add a custom domain (free) when ready.

> **Caveats:** (a) Vercel Hobby is **non-commercial** — if MatchMetric becomes a
> paid product, you must move to Pro ($20/mo). (b) Server components open
> Postgres TCP fine on Vercel's **Node** runtime — do **not** add
> `export const runtime = "edge"` to DB-touching routes. (c) Always use Neon's
> **pooled** string here so serverless cold-starts don't exhaust connections.

### 0c. Worker → stays local, now writing to Neon

The crawler keeps running on your Mac (best scraping-IP reputation, already
working, free). Point it at Neon and schedule the daily incremental:

1. Put the Neon **direct** URL in `<repo>/.env` as `DATABASE_URL` (gitignored),
   along with `TENNIS_CONTACT_EMAIL` and `TENNIS_ACCOUNT` (see `.env.example`).
2. Schedule the daily delta crawl. Two options on macOS:
   - **launchd (native, recommended):** load the provided
     `scripts/com.matchmetric.incremental.plist` (see its header for the
     two-line install). Runs `scripts/incremental.sh --year 2026` daily at 06:00.
   - **cron:** `crontab scripts/crontab.example` (edit the absolute paths first).

The worker auto-relogins via Playwright if the session expires, so once the bot
account is in `~/.tennis-platform/accounts.json` it runs unattended.

---

## Stage 1 — When the DB outgrows the free tier

Trigger: Neon free storage (0.5 GB) fills up as scorecards accumulate.

- **Cheapest:** Neon **Launch** — usage-based, ~$5/mo effective; lifts storage
  and lets you disable scale-to-zero. No migration, no code change.
- **Stay free longer:** **Xata** free tier is **15 GB** with no cold starts —
  also standard Postgres, so `postgres-js` + Drizzle work unchanged. Migration
  is one `pg_dump | psql` (reuse `scripts/migrate-to-neon.sh` against the Xata
  URL). Tradeoff: smaller ecosystem than Neon.

---

## Stage 2 — Moving the worker off your machine

Do this when you want the crawl to run without your laptop being on. Accept that
**any cloud option puts you on a datacenter IP**, so plan for the reputation
risk.

### Option A — Oracle Cloud Always Free (best free compute)

- **What you get:** an Ampere ARM VM, up to 4 OCPU / 24 GB RAM / 200 GB disk,
  **$0 forever**. Huge headroom for Chromium; OS-level `cron`; real filesystem
  for `~/.tennis-platform/`. You can even run `next start` on the same box to
  drop Vercel.
- **The catch:** Oracle's ASN is among the **most blocklisted for scraping**.
  Mitigate:
  - Keep a **residential proxy pre-wired but OFF**; flip it on only if USTA
    actually blocks the VM's IP. Cheapest reputable PAYG: Evomi ~$0.49/GB,
    PacketStream ~$1/GB — at your paced volume that's **~$2–5/mo insurance**,
    not a day-one cost.
  - **Login pattern:** solve CAPTCHA/MFA **locally** (headful Chromium on your
    Mac), save `context.storageState()` to `storageState.json`, and `scp` it to
    the VM; load with `browser.newContext({ storageState })`. Only escalate to
    Xvfb + noVNC if the session turns out to be strictly IP-bound.
  - Add an **hourly keep-alive** so Oracle's idle-reclamation (CPU <20% p95 over
    7 days) never triggers — a long-running crawl already clears this.
- **Build:** `apps/worker/Dockerfile` is ready — it uses the
  `mcr.microsoft.com/playwright:v1.60.0-noble` base (Chromium + OS deps + Node,
  multi-arch so it runs on Ampere ARM), installs the pnpm workspace, and runs
  the worker via `tsx`. Build from the **repo root**:
  ```bash
  docker build -f apps/worker/Dockerfile -t matchmetric-worker .
  ```
  Seed the bot account into a named volume once, then run the daily crawl:
  ```bash
  # one-time: copy your local ~/.tennis-platform creds+session into the volume
  docker run --rm -v matchmetric-data:/data -v "$HOME/.tennis-platform:/seed:ro" \
    --entrypoint sh matchmetric-worker \
    -c 'mkdir -p /data/.tennis-platform && cp -a /seed/. /data/.tennis-platform/'

  # daily incremental (schedule via host cron / a Fly scheduled machine)
  docker run --rm \
    -e DATABASE_URL='<neon-DIRECT-url>' \
    -e TENNIS_CONTACT_EMAIL='you@example.com' \
    -e TENNIS_ACCOUNT='norcal' \
    -v matchmetric-data:/data \
    matchmetric-worker
  ```
  Override the default `CMD` for one-offs, e.g. a sharded backfill:
  `docker run ... matchmetric-worker db backfill-scorecards-db --year 2026 --shard 0/4`.

### Option B — Fly.io machine (cleanest paid DX)

- ~$5/mo for a 1 GB always-on machine + **$3.60/mo dedicated egress IP** (stable
  IP for session continuity). Good Docker/cron support. Still a datacenter IP.

> Either way: **GCP e2-micro** (1 GB, perpetual free, US-only) is a fallback
> runner but tight on RAM and also a flagged big-3 IP. Avoid **Koyeb** for the
> worker (no static outbound IP, scales to zero at 1 hr idle).

---

## Stage 3 — Monetized / real traffic

- **Frontend:** Vercel **Pro** ($20/mo) — required once it's commercial; lifts
  function limits and bandwidth.
- **Postgres:** Neon **Launch/Scale** — provisioned compute, PITR, no
  scale-to-zero latency.
- **Worker:** Fly.io or the Oracle VM, with the residential proxy turned on if
  USTA blocking has become a problem at higher volume.

---

## Provider comparison reference (2026)

Condensed from the hosting research. Free-tier numbers change often — verify on
each provider's pricing page before committing.

### Worker hosts (long-lived headless Chromium)

| Platform | Free RAM | Always-on free? | Runs multi-hr crawl free? | Scraping IP rep | Cheapest paid |
|---|---|---|---|---|---|
| **Oracle Always Free** | 24 GB / 4 ARM | ✅ (idle-reclaim if all metrics <20% p95/7d) | ✅ best headroom | ❌ ASN heavily blocked | $0 |
| **GCP e2-micro** | 1 GB | ✅ perpetual | ⚠️ tight (add swap) | ❌ big-3 flagged | $0 |
| **Northflank Sandbox** | <1 GB? | ✅ "no sleeping" | ⚠️ may OOM | datacenter | ~$18/mo (1 GB) |
| **Railway** | 0.5 GB | credit-capped | ❌ OOMs | datacenter, shared IP | $5/mo Hobby |
| **Fly.io** | none | — | — | datacenter, **dedicated IP $3.60/mo** | ~$5–6/mo (1 GB) |
| **Render** | — | ❌ workers paid-only; free web sleeps 15 min | ❌ | datacenter, /24 shared | $7/mo worker |
| **Koyeb** | 0.5 GB | ❌ scale-to-zero @1 hr | ❌ | **no static outbound IP** | ~$5/mo |
| **AWS / Azure free** | 1 GB | ⏳ 6–12 mo only | temporarily | big-3 flagged | bills after |

### Postgres (small, always-queried)

| Provider | Free storage | Pause/delete risk | Notes | First paid |
|---|---|---|---|---|
| **Neon** ✅ | 0.5 GB | scale-to-zero, **no pause/delete**, sub-s wake | drop-in PG16, pooled endpoint, branching | ~$5/mo Launch |
| **Xata** | **15 GB** | no pause, no cold start | most generous free; smaller ecosystem | usage-based |
| **Aiven** | 1 GB | **powers off if unused** (daily worker mitigates) | 20-conn cap | ~$5/mo Developer |
| **Supabase** | 0.5 GB | **pauses after 7 days inactivity** (20–30 s wake) | daily worker should keep alive | $25/mo Pro |
| **CockroachDB** | ~10 GB | scales to zero | **not drop-in PG** (different SQL dialect) | PAYG |
| **Render PG** | 1 GB | ❌ **free DB auto-deletes after 30 days** | throwaway only | ~$7/mo |
| **Railway PG** | none permanent | trial credit expires | effectively paid | ~$5/mo |

### Frontend (Next.js 15 + direct Postgres)

| Host | Free tier | Direct PG TCP from server comps? | Sleeps? | First paid |
|---|---|---|---|---|
| **Vercel Hobby** ✅ | 100 GB transfer, 60 s fns | ✅ Node runtime (don't use edge) | no | $20/mo Pro (required if commercial) |
| **Netlify** | credit-based (2026) | ✅ Node functions | no | ~$19/mo |
| **Cloudflare Pages/Workers** | unlimited bandwidth | ⚠️ V8 isolates — needs Hyperdrive + `@opennextjs/cloudflare` | no | $5/mo |
| **Render web** | 100 GB | ✅ real Node server | ❌ **15-min sleep, ~30–60 s cold start** | $7/mo |
| **Self-host on the worker VM** | — | ✅ localhost to PG, lowest latency | no | $0 (you own ops) |

---

## Decisions baked into this plan

- **Worker stays local through Stage 1** because home-IP reputation beats every
  datacenter IP for an auth-walled, paced scraper — and it's free and already
  working.
- **Neon over Supabase** for the DB: Neon's scale-to-zero wakes transparently
  and never pauses/deletes, whereas Supabase free pauses after 7 days idle.
- **Vercel over Render** for the frontend: Render's free web service sleeps
  (cold-start on first hit), a poor first impression; Vercel Hobby doesn't.
- **The `prepare: false`** in `packages/db/src/client.ts` is already correct for
  Neon's pooled (PgBouncer transaction-mode) endpoint — no change needed.

## Sources

Hosting/free-tier facts verified 2026-05-29 against provider docs: Neon, Xata,
Supabase, Render, Railway, Aiven, CockroachDB pricing pages; Oracle Cloud Always
Free docs; Vercel Hobby/limits, Netlify pricing, Cloudflare Workers/Hyperdrive
docs; Fly.io pricing + egress-IP docs; plus practitioner sources on cloud-ASN
anti-bot reputation and Playwright `storageState` auth patterns.

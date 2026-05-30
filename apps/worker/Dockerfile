# MatchMetric crawler (Stage 2 of docs/DEPLOYMENT.md).
#
# Build context is the REPO ROOT (the worker needs the whole pnpm workspace):
#   docker build -f apps/worker/Dockerfile -t matchmetric-worker .
#
# Run the daily incremental crawl (creds + session persist on the /data volume):
#   docker run --rm \
#     -e DATABASE_URL='<neon-DIRECT-url>' \
#     -e TENNIS_CONTACT_EMAIL='you@example.com' \
#     -e TENNIS_ACCOUNT='norcal' \
#     -v matchmetric-data:/data \
#     matchmetric-worker
#
# One-off (override the default CMD), e.g. a sharded backfill:
#   docker run --rm -e DATABASE_URL=... -v matchmetric-data:/data \
#     matchmetric-worker db backfill-scorecards-db --year 2026 --shard 0/4
#
# FIRST RUN: seed the volume with the bot account so Playwright can auto-login:
#   docker run --rm -v matchmetric-data:/data -v "$HOME/.tennis-platform:/seed:ro" \
#     --entrypoint sh matchmetric-worker -c 'mkdir -p /data/.tennis-platform && cp -a /seed/. /data/.tennis-platform/'
# (or solve the headful login locally and copy the session JSON into the volume.)

# Playwright base image bundles Chromium + all OS deps + Node. The tag MUST
# match the resolved playwright version in pnpm-lock.yaml (currently 1.60.0).
# This image is multi-arch (amd64 + arm64), so it runs on Fly (amd64) and on an
# Oracle Ampere ARM VM alike.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

# pnpm via corepack, pinned to the repo's packageManager version.
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# --- Dependency layer (cached until any manifest or the lockfile changes) ---
# Copy every workspace manifest first so `pnpm install` caches across code edits.
# All members must be present for a --frozen-lockfile install to validate.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json        apps/web/
COPY apps/worker/package.json     apps/worker/
COPY packages/db/package.json     packages/db/
COPY packages/scraper/package.json   packages/scraper/
COPY packages/calibrate/package.json packages/calibrate/
COPY packages/ratings/package.json   packages/ratings/
COPY packages/optimizer/package.json packages/optimizer/
COPY packages/fixtures/package.json  packages/fixtures/
RUN pnpm install --frozen-lockfile

# --- Source ---
# Workspace packages export ./src/*.ts directly, so tsx runs everything from
# source — no compile step. .dockerignore keeps node_modules/.next/.git out.
COPY . .

# Browsers are preinstalled in the base image; point the lib at them (the base
# image already sets this, repeated here for clarity / pinning).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Persistent state. The code resolves creds + sessions from $HOME/.tennis-platform
# (accounts.json, sessions/<account>.json). Point HOME at a mounted volume so
# they survive container restarts.
ENV HOME=/data
RUN mkdir -p /data/.tennis-platform/sessions
VOLUME ["/data"]

WORKDIR /app/apps/worker

# DATABASE_URL + TENNIS_CONTACT_EMAIL must be injected at runtime (env/secrets).
ENTRYPOINT ["pnpm", "exec", "tsx", "src/cli.ts"]
CMD ["db", "incremental", "--year", "2026"]

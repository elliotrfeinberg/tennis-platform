#!/usr/bin/env bash
# Incremental crawl wrapper for cron (production). cron/launchd start jobs with
# a bare environment, so we set up node + project env explicitly. All args pass
# through to `db incremental` (e.g. --year 2026, --refresh-flights). No secrets
# live here — DATABASE_URL is sourced from the gitignored .env (or the
# environment, if the deploy injects it).
set -euo pipefail

# Repo root derived from this script's location (portable across machines).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO/apps/worker"

# Ensure `node` is on PATH. Prefer whatever the deploy provides; fall back to
# nvm if present (dev machines).
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi
command -v node >/dev/null 2>&1 || {
  echo "FATAL: node not found on PATH" >&2
  exit 127
}

# Project env. DATABASE_URL must come from .env or the injected environment.
set -a
# shellcheck disable=SC1091
[ -f "$REPO/.env" ] && source "$REPO/.env"
set +a
: "${DATABASE_URL:?DATABASE_URL must be set (in .env or the environment)}"
export TENNIS_ACCOUNT="${TENNIS_ACCOUNT:-norcal}"
: "${TENNIS_CONTACT_EMAIL:?TENNIS_CONTACT_EMAIL must be set}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] incremental start: args=$*"
node_modules/.bin/tsx src/cli.ts db incremental "$@"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] incremental done"

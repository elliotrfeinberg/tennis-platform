#!/usr/bin/env bash
# Full wide-crawl pipeline (one-time / re-backfill), run detached. Each network
# step retries on non-zero exit; all steps are resumable (enumerate skips
# visited players, backfill skips already-fetched matches), so transient
# kills/expiries heal on retry. For the daily incremental delta use
# scripts/incremental.sh instead.
#
# Launch detached (survives the shell + the Claude harness reaping it):
#   ( nohup bash scripts/pipeline.sh > /tmp/tennis-pipeline.log 2>&1 < /dev/null & )
# Watch:   tail -f /tmp/tennis-pipeline.log
# See CLAUDE.md › "Data pipeline ops" for status-check + recompute commands.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO/apps/worker" || exit 1

# Env: DATABASE_URL + TENNIS_CONTACT_EMAIL from .env (gitignored); account name.
set -a; [ -f "$REPO/.env" ] && source "$REPO/.env"; set +a
export TENNIS_ACCOUNT="${TENNIS_ACCOUNT:-norcal}"
: "${DATABASE_URL:?DATABASE_URL must be set (in .env or the environment)}"
: "${TENNIS_CONTACT_EMAIL:?TENNIS_CONTACT_EMAIL must be set}"

# Ensure node is on PATH for cron/launchd-style bare environments.
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi
TSX=node_modules/.bin/tsx

# Pacing for the crawl steps (detection-evasion). Tune via env if needed.
DELAY=(--min-delay "${MIN_DELAY:-3000}" --max-delay "${MAX_DELAY:-5000}")
YEARS="${YEARS:-2025,2026}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
run_until_ok() {
  local label="$1"; shift
  local tries=0
  until "$@"; do
    tries=$((tries + 1))
    log "STEP '$label' exited non-zero (try $tries) — retrying in 30s"
    sleep 30
  done
  log "STEP '$label' OK"
}

log "=== PIPELINE START (years=$YEARS) ==="
run_until_ok "enumerate-flights" $TSX src/cli.ts db enumerate-flights --years "$YEARS" --limit-players 4000 --stop-after-barren 200 "${DELAY[@]}"
run_until_ok "backfill-2026"     $TSX src/cli.ts db backfill-scorecards-db --year 2026 "${DELAY[@]}"
run_until_ok "backfill-2025"     $TSX src/cli.ts db backfill-scorecards-db --year 2025 "${DELAY[@]}"
run_until_ok "normalize"         $TSX src/cli.ts db normalize-matches
run_until_ok "subflights-2026"   $TSX src/cli.ts db enumerate-subflights --year 2026 "${DELAY[@]}"
run_until_ok "subflights-2025"   $TSX src/cli.ts db enumerate-subflights --year 2025 "${DELAY[@]}"
run_until_ok "compute-ratings"   $TSX src/cli.ts db compute-ratings --persist
log "=== PIPELINE DONE ==="

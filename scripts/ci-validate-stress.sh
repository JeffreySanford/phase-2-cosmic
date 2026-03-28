#!/usr/bin/env bash
set -euo pipefail

# CI-friendly validation wrapper for stress mode.
# Starts the Docker compose stack (Prometheus+dependencies) and the SSR server,
# waits for them to become ready, then runs the stress validation scripts.

COMPOSE_FILE="${COMPOSE_FILE:-docker/dev-compose.yml}"
SSR_URL="${SSR_URL:-http://localhost:4000}"
PROM_READY_URL="${PROM_READY_URL:-http://localhost:9090/-/ready}"

# If you want to re-use an already-running compose/SSR stack (e.g. local dev),
# set SKIP_COMPOSE=true or SKIP_SSR=true.
SKIP_COMPOSE="${SKIP_COMPOSE:-false}"
SKIP_SSR="${SKIP_SSR:-false}"

# If set to true, will build the docker compose images before bringing the stack up.
# Default: false (reuse existing images) so local dev runs are fast.
BUILD_IMAGES="${BUILD_IMAGES:-false}"

# When running in CI, ensure stress mode uses docker workers.
export STRESS_USE_DOCKER_WORKERS="true"
export STRESS_CALIBRATE_WORKERS="true"

SSR_PID=""
STARTED_COMPOSE="false"

function log() {
  echo "[ci-validate-stress] $*"
}

function fail() {
  echo "[ci-validate-stress] ERROR: $*" >&2
  exit 1
}

function wait_for_url() {
  local url="$1"
  local retries=${2:-60}
  local delay=${3:-2}
  local n=0

  until curl -sSf "$url" >/dev/null 2>&1; do
    n=$((n + 1))
    if [ "$n" -ge "$retries" ]; then
      return 1
    fi
    sleep "$delay"
  done
  return 0
}

function collectFailureArtifacts() {
  local exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    return
  fi

  log "Collecting failure artifacts (exit=$exit_code)"
  mkdir -p "${VALIDATION_OUTPUT_DIR:-validation-output/ci-failure}" || true
  echo "exit_code=$exit_code" > "${VALIDATION_OUTPUT_DIR:-validation-output/ci-failure}/exit_code.txt"

  log "Capturing docker ps state"
  docker ps -a > "${VALIDATION_OUTPUT_DIR:-validation-output/ci-failure}/docker-ps.txt" 2>&1 || true
  docker compose -f "$COMPOSE_FILE" ps > "${VALIDATION_OUTPUT_DIR:-validation-output/ci-failure}/compose-ps.txt" 2>&1 || true

  log "Capturing docker compose logs"
  docker compose -f "$COMPOSE_FILE" logs --no-color --no-log-prefix > "${VALIDATION_OUTPUT_DIR:-validation-output/ci-failure}/compose-logs.txt" 2>&1 || true

  if [ -n "${SSR_PID:-}" ]; then
    log "Capturing SSR process stdout/stderr (if possible)"
    if [ -f "/tmp/ssr.log" ]; then
      cp /tmp/ssr.log "${VALIDATION_OUTPUT_DIR:-validation-output/ci-failure}/ssr.log" || true
    fi
  fi
}

function cleanup() {
  if [ -n "${SSR_PID:-}" ]; then
    log "Stopping SSR (pid=$SSR_PID)"
    kill "$SSR_PID" >/dev/null 2>&1 || true
    wait "$SSR_PID" 2>/dev/null || true
  fi

  if [ "$STARTED_COMPOSE" = "true" ]; then
    log "Stopping docker compose stack ($COMPOSE_FILE)"
    docker compose -f "$COMPOSE_FILE" down --remove-orphans || true
  fi
}

trap "collectFailureArtifacts; cleanup" EXIT

# 1) Start docker compose stack, if not already running.
if [ "$SKIP_COMPOSE" != "true" ]; then
  log "Starting docker compose stack ($COMPOSE_FILE)"

  if [ "$BUILD_IMAGES" = "true" ]; then
    log "Building docker compose images (this may take a while)"
    docker compose -f "$COMPOSE_FILE" build --pull --parallel
  fi

  docker compose -f "$COMPOSE_FILE" up -d
  STARTED_COMPOSE="true"

  log "Waiting for Prometheus to become ready ($PROM_READY_URL)"
  if ! wait_for_url "$PROM_READY_URL" 60 2; then
    fail "Prometheus did not become ready in time ($PROM_READY_URL)"
  fi
  log "Prometheus ready"
fi

# 2) Start SSR (server-side render API) if not already up.
if [ "$SKIP_SSR" != "true" ]; then
  log "Waiting for SSR to be reachable at $SSR_URL"
  if ! wait_for_url "$SSR_URL/api/load-profile" 60 2; then
    log "SSR not responding; starting via pnpm run serve:ssr"
    if ! command -v pnpm >/dev/null 2>&1; then
      fail "pnpm not found; cannot start SSR"
    fi

    # Start SSR in the background and wait for it to become responsive
    pnpm run serve:ssr > /tmp/ssr.log 2>&1 &
    SSR_PID=$!

    log "SSR started (pid=$SSR_PID); waiting for readiness"
    if ! wait_for_url "$SSR_URL/api/load-profile" 60 2; then
      log "--- SSR log (tail) ---"
      tail -n 50 /tmp/ssr.log || true
      fail "SSR did not become ready in time"
    fi
  else
    log "SSR already running at $SSR_URL"
  fi
fi

# Helper: run a command with retries and exponential backoff.
run_with_retries() {
  local cmd="$*"
  local max_attempts=${MAX_ATTEMPTS:-3}
  local delay=${INITIAL_DELAY:-2}
  local attempt=1

  while true; do
    log "Attempt ${attempt}/${max_attempts}: $cmd"
    if bash -c "$cmd"; then
      return 0
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      log "Command failed after ${attempt} attempts: $cmd"
      return 1
    fi

    log "Retrying in ${delay}s..."
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

# 3) Run validations
# Ensure each validation script writes artifacts to a shared directory for CI upload.
export VALIDATION_OUTPUT_DIR="${VALIDATION_OUTPUT_DIR:-validation-output/validate-100pct-load}"

log "Running stress container health check"
run_with_retries "VALIDATION_OUTPUT_DIR=validation-output/check-stress-containers pnpm run validate:stress"

log "Running 100% load validation"
run_with_retries "VALIDATION_OUTPUT_DIR=${VALIDATION_OUTPUT_DIR} pnpm run validate:load"

log "All validations passed"

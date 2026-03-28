#!/usr/bin/env bash
set -euo pipefail

# Stress harness that drives load using the existing data-generator Docker image
# instead of the Nest SSR server's local process spawn.
#
# This script:
#   1) ensures the `phase2/data-generator:dev` image is built (via docker compose)
#   2) starts N detached generator containers (one per worker)
#   3) optionally runs the governance publisher load (same as scripts/stress-run.sh)
#   4) stops/cleans up generators after the configured duration
#
# Usage:
#   PROFILE=100 SMOKE_SECONDS=180 ./scripts/stress-run-docker.sh
#
# Requirements:
#   - docker is installed and usable by the current user
#   - `docker compose -f docker/dev-compose.yml` has been run at least once (to build images)
#   - the local compose stack is running if you want governance / Prometheus metrics

SSR_URL="${SSR_URL:-http://localhost:4000}"
PROFILE="${PROFILE:-100}"
SMOKE_SECONDS="${SMOKE_SECONDS:-180}"
RATE="${RATE:-200}"
TOTAL="${TOTAL:-5000}"
GOV_URL="${GOV_URL:-$SSR_URL/api/v1/jobs}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$REPO_ROOT/logs/stress-run-docker-${STAMP}"
mkdir -p "$OUT_DIR"
LOG_DIR="$OUT_DIR"

# Determine workload shape (matches apps/frontend/server.nest.ts PROFILE_MAP)
case "$PROFILE" in
  10)
    WORKERS=0
    WORKER_RATE=0
    PAYLOAD_SIZE=512
    ;;
  25)
    WORKERS=2
    WORKER_RATE=500000
    PAYLOAD_SIZE=1024
    ;;
  50)
    WORKERS=4
    WORKER_RATE=1500000
    PAYLOAD_SIZE=1024
    ;;
  100)
    WORKERS=8
    WORKER_RATE=3000000
    PAYLOAD_SIZE=2048
    ;;
  *)
    echo "ERROR: unsupported PROFILE=${PROFILE}. Must be one of 10/25/50/100" >&2
    exit 1
    ;;
esac

if [ "$WORKERS" -le 0 ]; then
  echo "Profile ${PROFILE} selected; no generator workers to start. Exiting."
  exit 0
fi

# Ensure data-generator image exists (build via compose if needed).
if ! docker image inspect phase2/data-generator:dev >/dev/null 2>&1; then
  echo "Building data-generator image (phase2/data-generator:dev) via docker compose..."
  docker compose -f "$REPO_ROOT/docker/dev-compose.yml" build data-generator
fi

# Ensure logs directory exists for mount
mkdir -p "$REPO_ROOT/tools/data-generator/logs"

# Track created containers for cleanup
CONTAINERS=()
CONTAINER_NAMES=()

# Optional: capture docker logs for each generator container into the artifacts folder.
# Set CAPTURE_DOCKER_LOGS=true to enable (power-user mode).
CAPTURE_DOCKER_LOGS="${CAPTURE_DOCKER_LOGS:-false}"

write_json_file() {
  local path="$1"; shift
  printf '%s' "$1" > "$path"
}

set_runtime_profile() {
  local pct="$1"; shift
  local smoke="$1"; shift
  echo "Setting runtime load profile to $pct% (smokeSeconds=$smoke)"
  curl -sS -X POST "$SSR_URL/api/load-profile" \
    -H "content-type: application/json" \
    -d "{\"profilePct\":${pct},\"smokeSeconds\":${smoke}}" \
    > "$LOG_DIR/profile-set.json" || true
}

get_runtime_status() {
  curl -sS "$SSR_URL/api/load-profile" > "$LOG_DIR/profile-status-${1}.json" || true
}

capture_prometheus() {
  local name="$1"; shift
  local query="$1"; shift
  curl --globoff -sS "$SSR_URL/api/proxy/prometheus?query=${query}" > "$LOG_DIR/${name}.json" || true
}

cleanup() {
  if [ "$CAPTURE_DOCKER_LOGS" = "true" ]; then
    echo "Capturing docker logs for generator containers (cleanup)..."
    for idx in "${!CONTAINERS[@]}"; do
      cid="${CONTAINERS[$idx]}"
      name="${CONTAINER_NAMES[$idx]}"
      docker logs "$cid" > "$LOG_DIR/docker-${name}.log" 2>&1 || true
    done
  fi

  echo "Cleaning up generator containers..."
  for c in "${CONTAINERS[@]:-}"; do
    docker rm -f "$c" >/dev/null 2>&1 || true
  done
  echo "Reverting runtime profile to 10%"
  curl -sS -X POST "$SSR_URL/api/load-profile" \
    -H "content-type: application/json" \
    -d '{"profilePct":10}' \
    > "$LOG_DIR/profile-revert.json" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Apply the runtime profile (mirrors scripts/stress-run.sh behavior)
set_runtime_profile "$PROFILE" "$SMOKE_SECONDS"

# Snapshot pre-run status/metrics
get_runtime_status "before"
capture_prometheus "prom-before-bytes-rate" "rate(generator_bytes_produced_total[1m])"
capture_prometheus "prom-before-cpu" "100%20*%20sum(rate(process_cpu_seconds_total%7Bjob%3D~%22data-generator%7Cjava-ingest%22%7D%5B1m%5D))"

# Start containers
for i in $(seq 1 "$WORKERS"); do
  name="stress-gen-${PROFILE}-${i}"
  logpath="/var/lib/data-generator/logs/payloads.${PROFILE}.${i}.bin"

  # Ensure stale containers from a previous run are removed
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi

  echo "Starting generator [${name}] rate=${WORKER_RATE} payload=${PAYLOAD_SIZE}"
  # When running under Git Bash on Windows, MSYS can rewrite POSIX paths into Windows paths
  # (e.g. "/usr/local/bin" -> "C:/Program Files/Git/usr/local/bin"). Disable that translation for this command.
  cid=$(MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" docker run -d \
    --name "$name" \
    --rm \
    --entrypoint "/usr/local/bin/data-generator" \
    -v "$REPO_ROOT/tools/data-generator/logs:/var/lib/data-generator/logs" \
    phase2/data-generator:dev \
    --rate=${WORKER_RATE} \
    --payload-size=${PAYLOAD_SIZE} \
    --no-stdout \
    --sink=file:${logpath} \
    --audit-every=2000)

  CONTAINERS+=("$cid")
  CONTAINER_NAMES+=("$name")
done

# Optionally run the governance publisher load (same as scripts/stress-run.sh)
if [ "${RUN_PUBLISHER:-true}" = "true" ]; then
  echo "Running governance publisher load (RATE=${RATE}, TOTAL=${TOTAL})"
  RATE="${RATE}" TOTAL="${TOTAL}" GOV_URL="${GOV_URL}" \
    node "$REPO_ROOT/tools/perf/job-publisher.js" > "$LOG_DIR/job-publisher.log" 2>&1 || true
fi

# Keep load running for the configured duration
echo "Stress load running for ${SMOKE_SECONDS}s (profile ${PROFILE}, ${WORKERS} workers)."
sleep "${SMOKE_SECONDS}"

# Snapshot post-run status/metrics
get_runtime_status "after"
capture_prometheus "prom-after-bytes-rate" "rate(generator_bytes_produced_total[1m])"
capture_prometheus "prom-after-cpu" "100%20*%20sum(rate(process_cpu_seconds_total%7Bjob%3D~%22data-generator%7Cjava-ingest%22%7D%5B1m%5D))"

# Optionally capture docker logs for each worker container (power-user mode)
if [ "$CAPTURE_DOCKER_LOGS" = "true" ]; then
  echo "Capturing docker logs for generator containers..."
  for idx in "${!CONTAINERS[@]}"; do
    cid="${CONTAINERS[$idx]}"
    name="${CONTAINER_NAMES[$idx]}"
    docker logs "$cid" > "$LOG_DIR/docker-${name}.log" 2>&1 || true
  done
fi

echo "Stress run complete. Artifacts: $LOG_DIR"

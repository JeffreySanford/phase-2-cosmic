#!/usr/bin/env bash
set -euo pipefail

# Health-check helper for stress mode.
# Verifies that enabling 100% profile creates docker containers and disabling removes them.

SSR_URL="${SSR_URL:-http://localhost:4000}"
OUTPUT_DIR="${VALIDATION_OUTPUT_DIR:-validation-output/check-stress-containers}"

function fail() {
  echo "ERROR: $*" >&2
  exit 1
}

function curlJson() {
  local url="$1"
  curl -sS "$url" || true
}

function setProfile() {
  local pct="$1"
  curl -sS -X POST "$SSR_URL/api/load-profile" \
    -H "content-type: application/json" \
    -d "{\"profilePct\":${pct}}" >/dev/null 2>&1 || true
}

function countStressContainers() {
  docker ps --filter "name=cosmic-stress-" --format "{{.Names}}" | wc -l | tr -d ' ' 
}

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Ensure SSR is reachable
if ! curl -sS "$SSR_URL/api/load-profile" >/dev/null 2>&1; then
  echo "Cannot reach SSR at $SSR_URL. Ensure the frontend SSR server is running." > "$OUTPUT_DIR/error.txt"
  fail "Cannot reach SSR at $SSR_URL. Ensure the frontend SSR server is running."
fi

# Start stress mode
echo "Setting profile=100 (stress)"
setProfile 100
sleep 5

local_count=$(countStressContainers)
echo "stress container count: ${local_count}" > "$OUTPUT_DIR/container-count-before.txt"
if [ "$local_count" -le 0 ]; then
  fail "Expected stress containers to be running, but found ${local_count}."
fi

echo "Stress containers running: ${local_count}"

# Disable stress mode
echo "Setting profile=10 (baseline)"
setProfile 10
sleep 5

local_count=$(countStressContainers)
echo "stress container count after cleanup: ${local_count}" > "$OUTPUT_DIR/container-count-after.txt"
if [ "$local_count" -ne 0 ]; then
  fail "Expected stress containers to be stopped, but found ${local_count}."
fi

echo "Stress containers cleaned up successfully."

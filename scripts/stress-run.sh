#!/usr/bin/env bash
set -euo pipefail

# Repeatable stress harness:
# 1) set runtime load profile via SSR API
# 2) run governance job publisher load
# 3) capture Prometheus snapshots + compose logs
# 4) always revert profile back to 10%

SSR_URL="${SSR_URL:-http://localhost:4000}"
PROFILE="${PROFILE:-100}"
SMOKE_SECONDS="${SMOKE_SECONDS:-180}"
RATE="${RATE:-200}"
TOTAL="${TOTAL:-5000}"
GOV_URL="${GOV_URL:-$SSR_URL/api/v1/jobs}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="logs/stress-run-${STAMP}"
mkdir -p "${OUT_DIR}"

revert_profile() {
  curl -sS -X POST "${SSR_URL}/api/load-profile" \
    -H "content-type: application/json" \
    -d '{"profilePct":10}' > "${OUT_DIR}/profile-revert.json" || true
}
trap revert_profile EXIT

echo "Setting runtime load profile to ${PROFILE}% (smokeSeconds=${SMOKE_SECONDS})"
curl -sS -X POST "${SSR_URL}/api/load-profile" \
  -H "content-type: application/json" \
  -d "{\"profilePct\":${PROFILE},\"smokeSeconds\":${SMOKE_SECONDS}}" \
  > "${OUT_DIR}/profile-set.json"

echo "Capturing pre-run profile status + metrics"
curl -sS "${SSR_URL}/api/load-profile" > "${OUT_DIR}/profile-status-before.json"
curl -sS "${SSR_URL}/api/proxy/prometheus?query=rate(generator_bytes_produced_total[1m])" > "${OUT_DIR}/prom-before-bytes-rate.json" || true
curl -sS "${SSR_URL}/api/proxy/prometheus?query=100%20*%20sum(rate(process_cpu_seconds_total%7Bjob%3D~%22data-generator%7Cjava-ingest%22%7D%5B1m%5D))" > "${OUT_DIR}/prom-before-cpu.json" || true

echo "Running governance publisher load (RATE=${RATE}, TOTAL=${TOTAL})"
RATE="${RATE}" TOTAL="${TOTAL}" GOV_URL="${GOV_URL}" node tools/perf/job-publisher.js > "${OUT_DIR}/job-publisher.log" 2>&1

echo "Capturing post-run profile status + metrics"
curl -sS "${SSR_URL}/api/load-profile" > "${OUT_DIR}/profile-status-after.json"
curl -sS "${SSR_URL}/api/proxy/prometheus?query=rate(generator_bytes_produced_total[1m])" > "${OUT_DIR}/prom-after-bytes-rate.json" || true
curl -sS "${SSR_URL}/api/proxy/prometheus?query=100%20*%20sum(rate(process_cpu_seconds_total%7Bjob%3D~%22data-generator%7Cjava-ingest%22%7D%5B1m%5D))" > "${OUT_DIR}/prom-after-cpu.json" || true

if command -v docker >/dev/null 2>&1; then
  echo "Capturing docker compose logs snapshot"
  docker compose -f docker/dev-compose.yml logs --no-color --timestamps data-generator java-governance > "${OUT_DIR}/compose-logs.txt" 2>&1 || true
fi

echo "Stress run complete. Artifacts: ${OUT_DIR}"

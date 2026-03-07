#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker/dev-compose.yml"
VERBOSE="${REDIS_PRECACHE_VERBOSE:-false}"

log() {
  echo "[redis-precache] $*"
}

log "Locating redis container (compose or standalone)..."
REDIS_CONTAINER=""
if docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | grep -q '^redis$'; then
  log "redis service defined in compose; using compose-managed redis"
  docker compose -f "$COMPOSE_FILE" up -d redis || true
  REDIS_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q redis 2>/dev/null || true)
fi

if [ -z "$REDIS_CONTAINER" ]; then
  if docker ps -a --format '{{.Names}}' | grep -q '^phase2-cosmic-redis$'; then
    log "Found existing container phase2-cosmic-redis; starting it"
    docker start phase2-cosmic-redis || true
    REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
  elif docker ps -a --format '{{.Names}}' | grep -q '^redis$'; then
    log "Found existing container named 'redis'; starting it"
    docker start redis || true
    REDIS_CONTAINER=$(docker ps -q -f name=redis)
  else
    log "No compose-managed redis found; creating temporary container 'phase2-cosmic-redis'"
    docker run -d --name phase2-cosmic-redis -p 6379:6379 redis:7 || true
    REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
  fi
fi

if [ -z "$REDIS_CONTAINER" ]; then
  log "ERROR: Could not start or find a Redis container." >&2
  exit 1
fi

if [ "$VERBOSE" = "true" ]; then
  log "Redis container id: ${REDIS_CONTAINER}"
fi

log "Waiting for Redis to be ready (up to 30s)..."
i=0
until docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    log "Warning: Redis did not become ready within 30 seconds." >&2
    break
  fi
  sleep 1
done

log "Prepopulating sample jobs, logs and artifacts..."
# create 5 sample jobs that will be picked up by the normal dispatcher
SAMPLED=0
for n in 1 2 3 4 5; do
  ID="job-$(date +%s)-$n"
  NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  JOB_JSON=$(cat <<EOF
{"jobId":"${ID}","workflow":"import","datasetId":"ui","state":"QUEUED","createdAt":"${NOW}","updatedAt":"${NOW}","parameters":{"executor":"simulator","sampleSeed":"startup"},"requestedBy":"dev"}
EOF
)
  docker exec "$REDIS_CONTAINER" redis-cli SET "job:${ID}" "${JOB_JSON}" >/dev/null
  # add logs
  docker exec "$REDIS_CONTAINER" redis-cli RPUSH "job:${ID}:logs" "Created job ${ID}" "Queued for execution" >/dev/null
  # add artifacts (store as a JSON map)
  ART_JSON=$(cat <<EOF
{"name":"output-${ID}.txt","url":"/artifacts/${ID}/output.txt"}
EOF
)
  docker exec "$REDIS_CONTAINER" redis-cli SET "job:${ID}:artifacts" "${ART_JSON}" >/dev/null
  SAMPLED=$((SAMPLED+1))
done

if [ "$VERBOSE" = "true" ]; then
  log "Summary of precached data:"
  log "Total job keys:"
  docker exec "$REDIS_CONTAINER" redis-cli KEYS "job:*" | sed -n '1,50p' || true

  log "Listing first ${SAMPLED} job entries (GET):"
  if docker exec "$REDIS_CONTAINER" -- sh -c "true" >/dev/null 2>&1; then
    docker exec "$REDIS_CONTAINER" sh -lc "for k in \$(redis-cli KEYS 'job:*' | sed -n '1,100p'); do echo '---' \$k; redis-cli GET \$k; done" | sed -n '1,400p' || true
  elif docker exec "$REDIS_CONTAINER" -- bash -c "true" >/dev/null 2>&1; then
    docker exec "$REDIS_CONTAINER" bash -lc "for k in \$(redis-cli KEYS 'job:*' | sed -n '1,100p'); do echo '---' \$k; redis-cli GET \$k; done" | sed -n '1,400p' || true
  else
    docker exec "$REDIS_CONTAINER" redis-cli KEYS 'job:*' | sed -n '1,400p' || true
  fi
fi

log "Precache complete. Added ${SAMPLED} jobs."

exit 0

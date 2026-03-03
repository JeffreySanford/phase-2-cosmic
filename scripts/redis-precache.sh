#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker/dev-compose.yml"

echo "[redis-precache] Locating redis container (compose or standalone)..."
REDIS_CONTAINER=""
if docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | grep -q '^redis$'; then
  echo "[redis-precache] redis service defined in compose; using compose-managed redis"
  docker compose -f "$COMPOSE_FILE" up -d redis || true
  REDIS_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q redis 2>/dev/null || true)
fi

if [ -z "$REDIS_CONTAINER" ]; then
  if docker ps -a --format '{{.Names}}' | grep -q '^phase2-cosmic-redis$'; then
    echo "[redis-precache] Found existing container phase2-cosmic-redis; starting it"
    docker start phase2-cosmic-redis || true
    REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
  elif docker ps -a --format '{{.Names}}' | grep -q '^redis$'; then
    echo "[redis-precache] Found existing container named 'redis'; starting it"
    docker start redis || true
    REDIS_CONTAINER=$(docker ps -q -f name=redis)
  else
    echo "[redis-precache] No compose-managed redis found; creating temporary container 'phase2-cosmic-redis'"
    docker run -d --name phase2-cosmic-redis -p 6379:6379 redis:7 || true
    REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
  fi
fi

if [ -z "$REDIS_CONTAINER" ]; then
  echo "[redis-precache] ERROR: Could not start or find a Redis container." >&2
  exit 1
fi

echo "[redis-precache] Redis container id: ${REDIS_CONTAINER}"

echo "[redis-precache] Waiting for Redis to be ready (up to 30s)..."
i=0
until docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    echo "[redis-precache] Warning: Redis did not become ready within 30 seconds." >&2
    break
  fi
  sleep 1
done

echo "[redis-precache] Prepopulating sample jobs, logs and artifacts..."
# create 5 sample jobs (marked deferred so they remain QUEUED until released)
SAMPLED=0
for n in 1 2 3 4 5; do
  ID="job-$(date +%s)-$n"
  NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  JOB_JSON=$(cat <<EOF
{"jobId":"${ID}","workflow":"import","datasetId":"ui","state":"QUEUED","createdAt":"${NOW}","updatedAt":"${NOW}","parameters":{"deferred":true},"requestedBy":"dev"}
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

echo "[redis-precache] Summary of precached data:"
echo "[redis-precache] Total job keys: "
docker exec "$REDIS_CONTAINER" redis-cli KEYS "job:*" | sed -n '1,50p' || true

echo "[redis-precache] Listing first ${SAMPLED} job entries (GET):"
if docker exec "$REDIS_CONTAINER" -- sh -c "true" >/dev/null 2>&1; then
  docker exec "$REDIS_CONTAINER" sh -lc "for k in \$(redis-cli KEYS 'job:*' | sed -n '1,100p'); do echo '---' \$k; redis-cli GET \$k; done" | sed -n '1,400p' || true
elif docker exec "$REDIS_CONTAINER" -- bash -c "true" >/dev/null 2>&1; then
  docker exec "$REDIS_CONTAINER" bash -lc "for k in \$(redis-cli KEYS 'job:*' | sed -n '1,100p'); do echo '---' \$k; redis-cli GET \$k; done" | sed -n '1,400p' || true
else
  # fallback: list keys without executing shell loop inside container
  docker exec "$REDIS_CONTAINER" redis-cli KEYS 'job:*' | sed -n '1,400p' || true
fi

echo "[redis-precache] Precache complete. Added ${SAMPLED} jobs."

exit 0

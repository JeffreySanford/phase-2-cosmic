#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker/dev-compose.yml"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
COMPOSE_ENV_FILE=""

if [ -f "$ENV_FILE" ]; then
  COMPOSE_ENV_FILE="$ENV_FILE"
elif [ -f "$ENV_SAMPLE" ]; then
  COMPOSE_ENV_FILE="$ENV_SAMPLE"
fi

compose() {
  if [ -n "$COMPOSE_ENV_FILE" ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

echo "[redis-precache] Locating redis container (compose or standalone)..."
REDIS_CONTAINER=""
if compose config --services 2>/dev/null | grep -q '^redis$'; then
  echo "[redis-precache] redis service defined in compose; using compose-managed redis"
  compose up -d redis || true
  REDIS_CONTAINER=$(compose ps -q redis 2>/dev/null || true)
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
CREATED_IDS=""
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
  CREATED_IDS="${CREATED_IDS} ${ID}"
done

TOTAL_KEYS=$(docker exec "$REDIS_CONTAINER" redis-cli KEYS 'job:*' | wc -l | tr -d ' \t')
echo "[redis-precache] Summary of precached data: ${TOTAL_KEYS} total job keys, ${SAMPLED} newly added."

echo "[redis-precache] Newly created jobs:"
for id in $CREATED_IDS; do
  echo "  job:${id}"
done

echo "[redis-precache] Precache complete. Added ${SAMPLED} jobs."

exit 0

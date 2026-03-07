#!/usr/bin/env bash
set -euo pipefail

# Simple method-level logging: writes timestamped lines to logs/ and prints to console
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/start-all-$(date +%Y%m%dT%H%M%S).log"
log() {
	if command -v date >/dev/null 2>&1; then
		TS=$(date --rfc-3339=seconds 2>/dev/null || date)
	else
		TS="$(date)"
	fi
	printf '%s %s\n' "$TS" "$*" | tee -a "$LOG_FILE"
}

log "[start-all] script started, logging to ${LOG_FILE}"

COMPOSE_FILE=docker/dev-compose.yml
CORE_SERVICES=(redis rabbitmq zookeeper kafka pulsar minio prometheus)
APP_SERVICES=(java-governance java-ingest data-generator)
AUX_SERVICES=(grafana loki alertmanager nginx-static)
REDIS_PRECACHE_VERBOSE=${REDIS_PRECACHE_VERBOSE:-false}

wait_for_service() {
	local service="$1"
	local timeout="${2:-60}"
	local cid=""
	local status=""
	local i
	for i in $(seq 1 "$timeout"); do
		cid="$(docker compose -f "$COMPOSE_FILE" ps -q "$service" 2>/dev/null || true)"
		if [ -n "$cid" ]; then
			status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
			if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
				log "[start-all] ${service} status=${status}"
				return 0
			fi
		fi
		sleep 1
	done
	log "[start-all] timeout waiting for ${service}; last status=${status:-unknown}"
	return 1
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
# Load environment variables from .env (private) or .env.sample (fallback)
if [ -f "$ENV_FILE" ]; then
	log "[start-all] Loading environment from $ENV_FILE"
 	set -a
 	# shellcheck disable=SC1090
 	. "$ENV_FILE"
 	set +a
elif [ -f "$ENV_SAMPLE" ]; then
	log "[start-all] Loading environment from $ENV_SAMPLE"
 	set -a
 	# shellcheck disable=SC1090
 	. "$ENV_SAMPLE"
 	set +a
fi

# If explicitly enabled, attempt Docker login so builds won't hit unauthenticated pull limits.
if [ "${DOCKER_LOGIN:-false}" = "true" ] && [ -n "${DOCKER_PAT:-}" ]; then
	DOCKER_USER=${DOCKER_USERNAME:-${USER:-}}
	log "[start-all] Attempting docker login for user: ${DOCKER_USER}"
	echo "${DOCKER_PAT}" | docker login --username "${DOCKER_USER}" --password-stdin || log "[start-all] Docker login failed (ignored)"
fi

log "[start-all] Ensuring docker images are up-to-date (will rebuild if necessary)..."
# Behavior options (env vars):
#  SKIP_BUILD=true     -> skip docker build entirely
#  BUILD_SERVICES="s1 s2" -> build only the listed services
#  NO_PULL=true        -> do not pull base images (omit --pull)

if [ "${SKIP_BUILD:-false}" = "true" ]; then
	log "[start-all] SKIP_BUILD=true; skipping docker build."
else
	if [ "${BUILD_ALL:-false}" = "true" ]; then
		log "[start-all] BUILD_ALL=true; building all services (ignoring BUILD_SERVICES)."
		BUILD_SERVICES=""
	fi
	if [ -n "${BUILD_SERVICES:-}" ]; then
		log "[start-all] Building only services: ${BUILD_SERVICES}"
		if [ "${NO_PULL:-false}" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel $BUILD_SERVICES
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel $BUILD_SERVICES
		fi
	else
		log "[start-all] Building all services"
		if [ "${NO_PULL:-false}" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel
		fi
	fi
fi

log "[start-all] Bringing up compose stack (detached)..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans "${CORE_SERVICES[@]}"

log "[start-all] Waiting for core infrastructure services..."
wait_for_service redis 45
wait_for_service rabbitmq 60
wait_for_service zookeeper 45
wait_for_service kafka 90
wait_for_service pulsar 120
wait_for_service minio 45
wait_for_service prometheus 60

log "[start-all] Ensuring Redis is ready and precaching sample data..."
if [ -x "$(command -v bash)" ]; then
	# run precache (script handles locating/starting redis)
	log "[start-all] running redis-precache.sh"
	REDIS_PRECACHE_VERBOSE="$REDIS_PRECACHE_VERBOSE" bash "$REPO_ROOT/scripts/redis-precache.sh" || log "[start-all] redis-precache step failed (ignored)"
else
	log "[start-all] bash not available; skipping redis precache"
fi

log "[start-all] Core services ready. Preparing broker bootstrap..."
# Ensure required Rabbit queues exist before JVM apps try passive-declare.
# This is idempotent and tolerates the queue already existing.
log "[start-all] Ensuring RabbitMQ queue 'phase2-events' exists (idempotent)"
for i in $(seq 1 30); do
	if curl -sf -u "guest:guest" http://localhost:15672/ >/dev/null 2>&1; then
		curl -s -u guest:guest -H 'Content-Type: application/json' -X PUT \
			http://localhost:15672/api/queues/%2F/phase2-events -d '{"durable":true}' || true
		log "[start-all] queue creation attempted"
		break
	fi
	sleep 1
done

log "[start-all] Starting application containers..."
docker compose -f "$COMPOSE_FILE" up -d "${APP_SERVICES[@]}"

GOV_TIMEOUT=${GOV_TIMEOUT:-90}
log "[start-all] Waiting for java-governance container health..."
wait_for_service java-governance "$GOV_TIMEOUT" || true

GOV_URL=${GOV_URL:-http://localhost:8082/actuator/health}
if curl -sf "$GOV_URL" 2>/dev/null | grep -q '"status"\s*:\s*"UP"'; then
	log "[start-all] java-governance actuator is UP"
else
	log "[start-all] java-governance actuator is not UP yet; continuing with dev servers"
fi

log "[start-all] Starting auxiliary containers..."
docker compose -f "$COMPOSE_FILE" up -d "${AUX_SERVICES[@]}"

if [ "${RUN_TEST_RUNNER:-false}" = "true" ]; then
	log "[start-all] RUN_TEST_RUNNER=true; starting test-runner"
	docker compose -f "$COMPOSE_FILE" up -d test-runner
fi

export FRONTEND_PORT=${FRONTEND_PORT:-4000}
log "[start-all] Launching local dev servers (SSR + frontend dev server)."
pnpm exec concurrently --kill-others-on-fail "pnpm run serve:ssr" "pnpm nx serve frontend" 2>&1 | tee -a "$LOG_FILE"

log "[start-all] finished"

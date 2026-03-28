#!/usr/bin/env bash
set -euo pipefail

# Append-only logging: keep one cumulative log and one per-run session log.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
RUN_ID="$(date +%Y%m%dT%H%M%S)"
LOG_FILE="$LOG_DIR/start-all.log"
SESSION_LOG_FILE="$LOG_DIR/start-all-${RUN_ID}.log"

timestamp() {
	if command -v date >/dev/null 2>&1; then
		date --rfc-3339=seconds 2>/dev/null || date
	else
		printf '%s' "$(date)"
	fi
}

write_log_line() {
	local line="$1"
	printf '%s\n' "$line" | tee -a "$LOG_FILE" >> "$SESSION_LOG_FILE"
}

log() {
	write_log_line "$(timestamp) $*"
}

stage() {
	local title="$1"
	write_log_line ""
	write_log_line "============================================================"
	write_log_line "$(timestamp) [start-all][stage] $title"
	write_log_line "============================================================"
}

log "[start-all] script started"
log "[start-all] cumulative log: ${LOG_FILE}"
log "[start-all] session log: ${SESSION_LOG_FILE}"

COMPOSE_FILE=docker/dev-compose.yml
DEFAULT_BUILD_SERVICES="java-governance data-generator java-ingest"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
stage "Environment Setup"
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

stage "Registry Authentication"
# If a Docker personal access token is provided, attempt to login so builds won't hit unauthenticated pull limits.
if [ -n "${DOCKER_PAT:-}" ]; then
	DOCKER_USER=${DOCKER_USERNAME:-${USER:-}}
	log "[start-all] Attempting docker login for user: ${DOCKER_USER}"
	echo "${DOCKER_PAT}" | docker login --username "${DOCKER_USER}" --password-stdin || log "[start-all] Docker login failed (ignored)"
fi

# If a GitHub PAT is provided, log in to ghcr.io so GHCR-hosted images (e.g. nginxlog-exporter) can be pulled.
if [ -n "${GITHUB_PAT:-}" ]; then
	GH_USER=${GITHUB_USERNAME:-${DOCKER_USERNAME:-${USER:-}}}
	log "[start-all] Attempting ghcr.io login for user: ${GH_USER}"
	echo "${GITHUB_PAT}" | docker login ghcr.io --username "${GH_USER}" --password-stdin || log "[start-all] ghcr.io login failed (ignored)"
fi

FAST_START="${FAST_START:-true}"
SKIP_BUILD_EFFECTIVE="${SKIP_BUILD:-}"
NO_PULL_EFFECTIVE="${NO_PULL:-}"
BUILD_SERVICES_EFFECTIVE="${BUILD_SERVICES:-}"

if [ -z "$SKIP_BUILD_EFFECTIVE" ]; then
	if [ "$FAST_START" = "true" ]; then
		SKIP_BUILD_EFFECTIVE="true"
	else
		SKIP_BUILD_EFFECTIVE="false"
	fi
fi

if [ -z "$NO_PULL_EFFECTIVE" ]; then
	if [ "$FAST_START" = "true" ]; then
		NO_PULL_EFFECTIVE="true"
	else
		NO_PULL_EFFECTIVE="false"
	fi
fi

if [ -z "$BUILD_SERVICES_EFFECTIVE" ] && [ "$FAST_START" != "true" ] && [ "${BUILD_ALL:-false}" != "true" ]; then
	BUILD_SERVICES_EFFECTIVE="$DEFAULT_BUILD_SERVICES"
fi

stage "Docker Build Strategy"
log "[start-all] Build strategy: FAST_START=${FAST_START} SKIP_BUILD=${SKIP_BUILD_EFFECTIVE} NO_PULL=${NO_PULL_EFFECTIVE} BUILD_ALL=${BUILD_ALL:-false} BUILD_SERVICES=${BUILD_SERVICES_EFFECTIVE:-<none>}"
log "[start-all] Ensuring docker images are up-to-date when requested..."
# Behavior options (env vars):
#  FAST_START=true         -> default dev path: skip compose build and avoid pulls
#  SKIP_BUILD=true|false   -> explicit override
#  BUILD_SERVICES="s1 s2"  -> build only the listed services
#  BUILD_ALL=true          -> build all services
#  NO_PULL=true|false      -> explicit pull policy override

if [ "$SKIP_BUILD_EFFECTIVE" = "true" ]; then
	log "[start-all] Skipping docker build for fast startup."
else
	if [ "${BUILD_ALL:-false}" = "true" ]; then
		log "[start-all] BUILD_ALL=true; building all services (ignoring BUILD_SERVICES)."
		BUILD_SERVICES_EFFECTIVE=""
	fi
	if [ -n "${BUILD_SERVICES_EFFECTIVE:-}" ]; then
		log "[start-all] Building only services: ${BUILD_SERVICES_EFFECTIVE}"
		if [ "$NO_PULL_EFFECTIVE" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel $BUILD_SERVICES_EFFECTIVE
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel $BUILD_SERVICES_EFFECTIVE
		fi
	else
		log "[start-all] Building all services"
		if [ "$NO_PULL_EFFECTIVE" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel
		fi
	fi
fi

stage "Compose Startup"
log "[start-all] Bringing up compose stack (detached)..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

stage "Redis Precache"
log "[start-all] Ensuring Redis is ready and precaching sample data..."
if [ -x "$(command -v bash)" ]; then
	# run precache (script handles locating/starting redis)
	log "[start-all] running redis-precache.sh"
	bash "$REPO_ROOT/scripts/redis-precache.sh" || log "[start-all] redis-precache step failed (ignored)"
else
	log "[start-all] bash not available; skipping redis precache"
fi

stage "Local Dev Runtime"
log "[start-all] Compose started. Launching local dev servers (SSR + frontend dev server)."
# Angular dev server remains on 4200 via the Nx target config.
# FRONTEND_PORT is the Nest SSR/proxy target port used by this workspace.
export FRONTEND_PORT=${FRONTEND_PORT:-4000}
export PORT=${PORT:-$FRONTEND_PORT}
export ALLOCATOR_PORT=${ALLOCATOR_PORT:-7777}
export FORGE_API_HOST_PORT=${FORGE_API_HOST_PORT:-4101}
export FORGE_WORKER_HOST_PORT=${FORGE_WORKER_HOST_PORT:-4102}
export REDIS_HOST=${REDIS_HOST:-127.0.0.1}
export REDIS_PORT=${REDIS_PORT:-6379}
export REDIS_URL=${REDIS_URL:-redis://${REDIS_HOST}:${REDIS_PORT}}

if command -v cygpath >/dev/null 2>&1; then
	WIN_REPO_ROOT="$(cygpath -w "$REPO_ROOT")"
else
	WIN_REPO_ROOT="$REPO_ROOT"
fi

log "[start-all] verifying local dev CLIs"
if [ ! -f "$REPO_ROOT/node_modules/tsx/dist/cli.mjs" ] || [ ! -f "$REPO_ROOT/node_modules/nx/bin/nx.js" ]; then
	log "[start-all] Missing local dev dependencies or CLI resolution failed. Run 'pnpm install' in $REPO_ROOT and retry."
	exit 1
fi

# NODE_PATH manipulation caused modules to fail resolving (see issue with concurrently requiring rxjs).
# Node's default resolution already locates packages under the repo root, so
# we don't need to set NODE_PATH here. Removing avoids "Cannot find module 'rxjs'"
# errors when the dev servers start.
# export NODE_PATH="$REPO_ROOT/node_modules${NODE_PATH:+;$NODE_PATH}"

kill_stale_port_listener() {
	local port="$1"
	local label="$2"
	local pid=""
	if command -v powershell.exe &>/dev/null; then
		pid=$(powershell.exe -NoProfile -Command "
			(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess |
			Where-Object { \$_ -match '^\d+$' } | Select-Object -First 1" 2>/dev/null | tr -d '[:space:]')
		if [ -n "$pid" ]; then
			log "[start-all] Found existing listener on $label port $port (PID $pid); stopping it before launch"
			powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force" 2>/dev/null || true
		fi
	else
		pid=$(lsof -ti tcp:"$port" 2>/dev/null || fuser "$port/tcp" 2>/dev/null)
		if [ -n "$pid" ]; then
			log "[start-all] Found existing listener on $label port $port (PID $pid); stopping it before launch"
			kill -9 "$pid" 2>/dev/null || true
		fi
	fi

	if [ -n "$pid" ]; then
		wait_for_port_clear "$port" "$label" 15 || true
	else
		log "[start-all] $label port $port is already clear"
	fi
}

wait_for_port_clear() {
	local port="$1"
	local label="$2"
	local timeout_seconds="${3:-15}"
	local attempt=0

	while [ "$attempt" -lt "$timeout_seconds" ]; do
		if command -v powershell.exe &>/dev/null; then
			if powershell.exe -NoProfile -Command "
				if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
					exit 1
				}
				exit 0" >/dev/null 2>&1; then
				log "[start-all] $label port $port is clear"
				return 0
			fi
		elif command -v nc >/dev/null 2>&1; then
			if ! nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
				log "[start-all] $label port $port is clear"
				return 0
			fi
		fi
		attempt=$((attempt + 1))
		sleep 1
	done

	log "[start-all] $label port $port did not clear within ${timeout_seconds}s; continuing"
	return 1
}

wait_for_tcp_listener() {
	local host="$1"
	local port="$2"
	local label="$3"
	local timeout_seconds="${4:-30}"
	local attempt=0

	log "[start-all] Waiting for ${label} on ${host}:${port} (up to ${timeout_seconds}s)"
	while [ "$attempt" -lt "$timeout_seconds" ]; do
		if command -v powershell.exe &>/dev/null; then
			if powershell.exe -NoProfile -Command "
				try {
					\$client = New-Object System.Net.Sockets.TcpClient
					\$async = \$client.BeginConnect('${host}', ${port}, \$null, \$null)
					if (-not \$async.AsyncWaitHandle.WaitOne(1000, \$false)) {
						\$client.Close()
						exit 1
					}
					\$client.EndConnect(\$async)
					\$client.Close()
					exit 0
				} catch {
					exit 1
				}" >/dev/null 2>&1; then
				return 0
			fi
		elif command -v nc >/dev/null 2>&1; then
			if nc -z "$host" "$port" >/dev/null 2>&1; then
				return 0
			fi
		fi
		attempt=$((attempt + 1))
		sleep 1
	done

	log "[start-all] ${label} on ${host}:${port} was not reachable before timeout; continuing anyway"
	return 1
}

kill_stale_port_listener "$PORT" "SSR"
kill_stale_port_listener "$ALLOCATOR_PORT" "allocator"
kill_stale_port_listener "$FORGE_API_HOST_PORT" "forge-api"
kill_stale_port_listener "$FORGE_WORKER_HOST_PORT" "forge-worker"
kill_stale_port_listener "4200" "frontend-dev"
kill_stale_port_listener "24678" "vite-hmr"
wait_for_tcp_listener "$REDIS_HOST" "$REDIS_PORT" "Redis" 30 || true

stage "Port Cleanup And Readiness"
log "[start-all] Cleaning up stale listeners and checking local dependencies"
sanitize_windows_env() {
	env -u PWD -u MSYSTEM -u SHELL -u TERM -u TMPDIR "$@"
}

PIDS=()
LABELS=()

start_bg() {
	local label="$1"
	shift
	"$@" &
	local pid=$!
	PIDS+=("$pid")
	LABELS+=("$label")
}

service_port_for_label() {
	local label="$1"
	case "$label" in
		ssr)
			printf '%s' "$FRONTEND_PORT"
			;;
		frontend)
			printf '%s' "4200"
			;;
		forge-api)
			printf '%s' "$FORGE_API_HOST_PORT"
			;;
		forge-worker)
			printf '%s' "$FORGE_WORKER_HOST_PORT"
			;;
		allocator)
			printf '%s' "$ALLOCATOR_PORT"
			;;
		*)
			return 1
			;;
	esac
}

stop_bg_jobs() {
	local pid
	for pid in "${PIDS[@]:-}"; do
		if kill -0 "$pid" 2>/dev/null; then
			kill "$pid" 2>/dev/null || true
		fi
	done
}

trap 'stop_bg_jobs' EXIT INT TERM

stage "Launching Background Services"
start_bg "allocator" node "$REPO_ROOT/tools/trident-allocator/server.js"
start_bg "forge-api" env FORGE_API_HOST_PORT="$FORGE_API_HOST_PORT" PORT="$FORGE_API_HOST_PORT" node "$REPO_ROOT/node_modules/tsx/dist/cli.mjs" --tsconfig "$REPO_ROOT/apps/cosmic-forge-api/tsconfig.app.json" "$REPO_ROOT/apps/cosmic-forge-api/src/main.ts"
start_bg "forge-worker" env PORT="$FORGE_WORKER_HOST_PORT" FORGE_WORKER_HOST_PORT="$FORGE_WORKER_HOST_PORT" FORGE_API_URL="http://127.0.0.1:$FORGE_API_HOST_PORT" node "$REPO_ROOT/node_modules/tsx/dist/cli.mjs" --tsconfig "$REPO_ROOT/apps/cosmic-forge-worker/tsconfig.app.json" "$REPO_ROOT/apps/cosmic-forge-worker/src/main.ts"
start_bg "ssr" sanitize_windows_env env FRONTEND_PORT="$FRONTEND_PORT" PORT="$FRONTEND_PORT" FORGE_API_URL="http://127.0.0.1:$FORGE_API_HOST_PORT" powershell.exe -NoProfile -Command "Set-Location '$WIN_REPO_ROOT'; node '.\\node_modules\\tsx\\dist\\cli.mjs' --watch --tsconfig apps/frontend/tsconfig.server.json apps/frontend/server.nest.ts"
start_bg "frontend" sanitize_windows_env env NX_DAEMON="false" powershell.exe -NoProfile -Command "Set-Location '$WIN_REPO_ROOT'; Set-Item Env:NX_DAEMON false; pnpm nx serve frontend --port=4200 --host=127.0.0.1"

log "[start-all] Background services launched: allocator, forge-api, forge-worker, ssr, frontend"
log "[start-all] Expected endpoints: SSR=$FRONTEND_PORT forge-api=$FORGE_API_HOST_PORT forge-worker=$FORGE_WORKER_HOST_PORT frontend-dev=4200 allocator=$ALLOCATOR_PORT"
wait_for_tcp_listener "127.0.0.1" "$ALLOCATOR_PORT" "allocator" 30 || true
wait_for_tcp_listener "127.0.0.1" "$FORGE_API_HOST_PORT" "forge-api" 30 || true
wait_for_tcp_listener "127.0.0.1" "$FORGE_WORKER_HOST_PORT" "forge-worker" 30 || true
wait_for_tcp_listener "127.0.0.1" "$FRONTEND_PORT" "SSR" 30 || true
wait_for_tcp_listener "127.0.0.1" "4200" "frontend-dev" 60 || true

while true; do
	for i in "${!PIDS[@]}"; do
		pid="${PIDS[$i]}"
		if ! kill -0 "$pid" 2>/dev/null; then
			label="${LABELS[$i]}"
			wait "$pid"
			exit_code=$?
			if port="$(service_port_for_label "$label" 2>/dev/null)"; then
				if wait_for_tcp_listener "127.0.0.1" "$port" "$label replacement" 3 >/dev/null 2>&1; then
					stage "Process Handoff"
					log "[start-all] ${label} watcher process exited with code ${exit_code}, but port ${port} is still serving. Keeping stack running."
					unset 'PIDS[$i]'
					unset 'LABELS[$i]'
					PIDS=("${PIDS[@]}")
					LABELS=("${LABELS[@]}")
					continue
				fi
			fi
			stage "Process Exit"
			log "[start-all] ${label} exited with code ${exit_code}"
			stop_bg_jobs
			exit "$exit_code"
		fi
	done
	sleep 1
done

log "[start-all] dev servers stopped"

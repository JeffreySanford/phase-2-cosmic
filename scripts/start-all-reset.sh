#!/usr/bin/env sh
set -e

# Simple method-level logging: writes timestamped lines to logs/ and prints to console
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/start-all-reset-$(date +%Y%m%dT%H%M%S).log"
log() {
  # timestamp + message, send to both stdout and logfile
  if command -v date >/dev/null 2>&1; then
    TS=$(date --rfc-3339=seconds 2>/dev/null || date)
  else
    TS="$(date)"
  fi
  printf '%s %s\n' "$TS" "$*" | tee -a "$LOG_FILE"
}

log "[start-all-reset] script started, logging to ${LOG_FILE}"

log "[start-all-reset] stopping local services"
node ./scripts/stop-local-services.js
# Resolve repository root (script lives in ./scripts/) and load env files from there.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
# Load environment variables from .env (private) or .env.sample (fallback)
if [ -f "$ENV_FILE" ]; then
  log "[start-all-reset] Loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
elif [ -f "$ENV_SAMPLE" ]; then
  log "[start-all-reset] Loading environment from $ENV_SAMPLE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_SAMPLE"
  set +a
fi

# If a Docker personal access token is provided, attempt to login so builds won't hit unauthenticated pull limits.
if [ -n "${DOCKER_PAT:-}" ]; then
  DOCKER_USER=${DOCKER_USERNAME:-${USER:-}}
  log "[start-all-reset] Attempting docker login for user: ${DOCKER_USER}"
  echo "${DOCKER_PAT}" | docker login --username "${DOCKER_USER}" --password-stdin || log "[start-all-reset] Docker login failed (ignored)"
fi

log "[start-all-reset] docker compose down (cleanup)"
docker compose -f docker/dev-compose.yml down --remove-orphans --rmi all -v

if [ -z "${SKIP_JAVA_TESTS:-}" ]; then
  log "[start-all-reset] Running Java tests (apps/java-governance, tools/java-ingest)"
  log "[start-all-reset] Ensuring Redis is available for tests"
  REDIS_CONTAINER=""
  # If the dev compose defines a redis service, start it via docker compose
  if docker compose -f docker/dev-compose.yml config --services 2>/dev/null | grep -q '^redis$'; then
    log "[start-all-reset] Bringing up redis from docker/dev-compose.yml"
    docker compose -f docker/dev-compose.yml up -d redis || true
    REDIS_CONTAINER=$(docker compose -f docker/dev-compose.yml ps -q redis 2>/dev/null || true)
  else
    # Otherwise, try to start or create a standalone redis container named phase2-cosmic-redis
    if docker ps -a --format '{{.Names}}' | grep -q '^phase2-cosmic-redis$'; then
      log "[start-all-reset] Starting existing container phase2-cosmic-redis"
      docker start phase2-cosmic-redis || true
      REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
    else
      log "[start-all-reset] Creating a temporary redis container 'phase2-cosmic-redis'"
      docker run -d --name phase2-cosmic-redis -p 6379:6379 redis:7 || true
      REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
    fi
  fi

  # Wait for Redis to become ready (up to ~30s)
  if [ -n "${REDIS_CONTAINER}" ]; then
    i=0
    until docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; do
      i=$((i+1))
      if [ "$i" -ge 30 ]; then
        log "Warning: Redis did not become ready within 30 seconds."
        break
      fi
      sleep 1
    done
    log "Redis container: ${REDIS_CONTAINER}"
    # Try to use the redis container's network namespace so 'localhost' inside the
    # Maven container resolves to Redis. This works when Redis was started as
    # a standalone container (phase2-cosmic-redis) or via compose (we inspect its name).
    REDIS_NAME=$(docker inspect --format '{{.Name}}' "$REDIS_CONTAINER" 2>/dev/null || true)
    # strip leading '/'
    REDIS_NAME=${REDIS_NAME#/}
    if [ -n "${REDIS_NAME}" ]; then
      NETWORK_ARG="--network=container:${REDIS_NAME}"
      log "Will run Maven container in network namespace of: ${REDIS_NAME}"
    fi
    # When running Maven locally, set Redis system properties so tests can reach
    # the container via the host gateway (useful on Windows/MSYS where redis
    # is published to the host). This will be ignored by Docker-run paths that
    # set their own properties when needed.
    if [ -n "${REDIS_CONTAINER}" ]; then
      MAVEN_REDIS_SYS_PROP="-Dspring.redis.host=host.docker.internal -Dspring.redis.port=6379"
    fi
    # If we have a Redis container and its network namespace is available,
    # prefer running Maven in Docker so the tests can resolve the 'redis' hostname.
    if [ -n "${NETWORK_ARG}" ]; then
      FORCE_DOCKER_MAVEN=1
    fi
  else
    log "Warning: No Redis container started; tests that require Redis may fail."
  fi
  # Prefer to run tests using a local JDK if available; only fall back to Docker when
  # necessary. If neither Java nor Docker are available, skip the Java tests so the
  # broader dev/start workflow can continue on developer machines without a JDK.
  if [ -z "${FORCE_DOCKER_MAVEN:-}" ] && command -v java >/dev/null 2>&1; then
    if command -v mvn >/dev/null 2>&1; then
      mvn -B ${MAVEN_REDIS_SYS_PROP:-} -f apps/java-governance test
      mvn -B ${MAVEN_REDIS_SYS_PROP:-} -f tools/java-ingest test
    elif [ -x "${REPO_ROOT}/mvnw" ] || [ -x "./mvnw" ]; then
      echo "Using project Maven Wrapper (mvnw)"
      if [ -x "${REPO_ROOT}/mvnw" ]; then
        (cd "$REPO_ROOT" && ./mvnw -B ${MAVEN_REDIS_SYS_PROP:-} -f apps/java-governance test)
        (cd "$REPO_ROOT" && ./mvnw -B ${MAVEN_REDIS_SYS_PROP:-} -f tools/java-ingest test)
      else
        ./mvnw -B ${MAVEN_REDIS_SYS_PROP:-} -f apps/java-governance test
        ./mvnw -B ${MAVEN_REDIS_SYS_PROP:-} -f tools/java-ingest test
      fi
    else
      log "mvn not found locally — running tests in a Maven Docker image"
      # Compute a Docker-friendly host path on Windows/MSYS environments
      HOST_PWD="$PWD"
      if command -v cygpath >/dev/null 2>&1; then
        HOST_PWD=$(cygpath -w "$PWD" 2>/dev/null || echo "$PWD")
        HOST_PWD=${HOST_PWD//\\//}
      else
        if pwd -W >/dev/null 2>&1; then
          HOST_PWD=$(pwd -W 2>/dev/null || echo "$PWD")
          HOST_PWD=${HOST_PWD//\\//}
        fi
      fi

      if [ -n "${MAVEN_DOCKER_IMAGE:-}" ]; then
        MAVEN_IMAGE="$MAVEN_DOCKER_IMAGE"
      else
        for img in \
          maven:3.9.6-eclipse-temurin-21 \
          maven:3.9.5-openjdk-21 \
          maven:3.9.4-openjdk-21 \
          maven:3-openjdk-21 \
          maven:3-openjdk-17; do
          log "Attempting to pull Docker image $img..."
          if docker pull "$img" >/dev/null 2>&1; then
            MAVEN_IMAGE="$img"
            break
          fi
        done
      fi

      if [ -z "${MAVEN_IMAGE:-}" ]; then
        log "Could not find a usable Maven Docker image. Either install Maven locally or set MAVEN_DOCKER_IMAGE to a working image tag."
        log "Examples: MAVEN_DOCKER_IMAGE=maven:3.9.5-openjdk-21 or install Maven on your PATH."
        exit 125
      fi

      if [ -n "${NETWORK_ARG:-}" ]; then
        ADD_HOST_ARG=""
        MAVEN_REDIS_SYS_PROP=""
      else
        ADD_HOST_ARG="--add-host=host.docker.internal:host-gateway"
        MAVEN_REDIS_SYS_PROP="-Dspring.redis.host=host.docker.internal -Dspring.redis.port=6379"
      fi

      log "[start-all-reset] Running Maven tests in Docker image: ${MAVEN_IMAGE}"
      docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "java -version || true; mvn -v || true; cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f apps/java-governance test"
      docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "java -version || true; mvn -v || true; cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f tools/java-ingest test"
    fi
  else
    log "Java (JDK) not found on PATH. Falling back to Docker Maven images if available."
    if command -v docker >/dev/null 2>&1; then
      log "Attempting to run tests in a Maven Docker image"
      # Compute a Docker-friendly host path on Windows/MSYS environments
      HOST_PWD="$PWD"
      if command -v cygpath >/dev/null 2>&1; then
        HOST_PWD=$(cygpath -w "$PWD" 2>/dev/null || echo "$PWD")
        HOST_PWD=${HOST_PWD//\\//}
      else
        if pwd -W >/dev/null 2>&1; then
          HOST_PWD=$(pwd -W 2>/dev/null || echo "$PWD")
          HOST_PWD=${HOST_PWD//\\//}
        fi
      fi

      if [ -n "${MAVEN_DOCKER_IMAGE:-}" ]; then
        MAVEN_IMAGE="$MAVEN_DOCKER_IMAGE"
      else
        for img in \
          maven:3.9.6-eclipse-temurin-21 \
          maven:3.9.5-openjdk-21 \
          maven:3.9.4-openjdk-21 \
          maven:3-openjdk-21 \
          maven:3-openjdk-17; do
          log "Attempting to pull Docker image $img..."
          if docker pull "$img" >/dev/null 2>&1; then
            MAVEN_IMAGE="$img"
            break
          fi
        done
      fi

      if [ -z "${MAVEN_IMAGE:-}" ]; then
        echo "Could not find a usable Maven Docker image. Skipping Java tests." >&2
        SKIPPED_JAVA_TESTS=1
      else
        if [ -n "${NETWORK_ARG:-}" ]; then
          ADD_HOST_ARG=""
          MAVEN_REDIS_SYS_PROP=""
        else
          ADD_HOST_ARG="--add-host=host.docker.internal:host-gateway"
          MAVEN_REDIS_SYS_PROP="-Dspring.redis.host=host.docker.internal -Dspring.redis.port=6379"
        fi

        log "[start-all-reset] Running Maven tests in Docker image: ${MAVEN_IMAGE}"
        docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "java -version || true; mvn -v || true; cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f apps/java-governance test"
        docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "java -version || true; mvn -v || true; cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f tools/java-ingest test"
      fi
    else
      log "Neither Java nor Docker available — skipping Java tests. To force tests, install a JDK or set SKIP_JAVA_TESTS to run them in CI with proper tools."
      SKIPPED_JAVA_TESTS=1
    fi
  fi

  # If the Maven build fails with a Java release mismatch, try a JDK-21 image explicitly.
  if [ $? -ne 0 ]; then
    echo "If you see 'release version 21 not supported', re-run with a JDK-21 Maven image:" >&2
    echo "  MAVEN_DOCKER_IMAGE=maven:3-openjdk-21 pnpm run start:all:reset" >&2
  fi
else
  echo "SKIP_JAVA_TESTS set - skipping Java tests"
fi

log "[start-all-reset] invoking start-all (build/start compose)"
cross-env BUILD_ALL=true sh ./scripts/start-all.sh 2>&1 | tee -a "$LOG_FILE"

log "Dev compose restarted. Use: docker compose -f docker/dev-compose.yml logs -f"
log "[start-all-reset] finished"

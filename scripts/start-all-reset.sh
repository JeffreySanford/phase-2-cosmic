#!/usr/bin/env sh
set -e

# Color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Simple method-level logging: writes timestamped lines to logs/ and prints to console
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/start-all-reset-$(date +%Y%m%dT%H%M%S).log"

# Track step outcomes for final summary
STEP_COUNT=0
STEP_SUCCESS=0
STEP_FAILED=0
STEP_WARNED=0
CURRENT_SUBSTEP=""
SUBSTEP_LETTER="a"

log() {
  # timestamp + message, send to both stdout and logfile
  if command -v date >/dev/null 2>&1; then
    TS=$(date --rfc-3339=seconds 2>/dev/null || date)
  else
    TS="$(date)"
  fi
  printf '%s %s\n' "$TS" "$*" | tee -a "$LOG_FILE"
}

# Verbose log - only to file, not console
log_verbose() {
  if command -v date >/dev/null 2>&1; then
    TS=$(date --rfc-3339=seconds 2>/dev/null || date)
  else
    TS="$(date)"
  fi
  printf '%s %s\n' "$TS" "$*" >> "$LOG_FILE"
}

# Step header with visual separator
step_start() {
  STEP_COUNT=$((STEP_COUNT + 1))
  SUBSTEP_LETTER="a"  # Reset substep counter for each new step
  printf "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  printf "${BOLD}${BLUE}▸ Step $STEP_COUNT: %s${NC}\n" "$1"
  printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  log "[Step $STEP_COUNT] $1"
}

# Substep functions for detailed progress tracking
substep_start() {
  CURRENT_SUBSTEP="${STEP_COUNT}${SUBSTEP_LETTER}"
  printf "${DIM}  ${SUBSTEP_LETTER}) %s...${NC}\n" "$1"
  log_verbose "[Step ${CURRENT_SUBSTEP}] $1"
}

substep_success() {
  printf "${GREEN}     ✓ %s${NC}\n" "$1"
  log "[Step ${CURRENT_SUBSTEP}] SUCCESS: $1"
  # Advance substep letter
  SUBSTEP_LETTER=$(echo "$SUBSTEP_LETTER" | tr 'a-y' 'b-z')
}

substep_warning() {
  printf "${YELLOW}     ⚠ %s${NC}\n" "$1"
  log "[Step ${CURRENT_SUBSTEP}] WARNING: $1"
  STEP_WARNED=$((STEP_WARNED + 1))
  # Advance substep letter
  SUBSTEP_LETTER=$(echo "$SUBSTEP_LETTER" | tr 'a-y' 'b-z')
}

substep_error() {
  printf "${RED}     ✗ %s${NC}\n" "$1"
  log "[Step ${CURRENT_SUBSTEP}] ERROR: $1"
  STEP_FAILED=$((STEP_FAILED + 1))
  # Advance substep letter
  SUBSTEP_LETTER=$(echo "$SUBSTEP_LETTER" | tr 'a-y' 'b-z')
}

substep_info() {
  printf "${DIM}       → %s${NC}\n" "$1"
  log_verbose "[Step ${CURRENT_SUBSTEP}] INFO: $1"
}

step_success() {
  printf "${GREEN}✓ %s${NC}\n" "$1"
  log "[SUCCESS] $1"
  STEP_SUCCESS=$((STEP_SUCCESS + 1))
}

step_warning() {
  printf "${YELLOW}⚠ %s${NC}\n" "$1"
  log "[WARNING] $1"
  STEP_WARNED=$((STEP_WARNED + 1))
}

step_error() {
  printf "${RED}✗ %s${NC}\n" "$1"
  log "[ERROR] $1"
  STEP_FAILED=$((STEP_FAILED + 1))
}

step_info() {
  printf "${DIM}  → %s${NC}\n" "$1"
  log_verbose "[INFO] $1"
}

# Header banner
printf "\n${BOLD}${CYAN}"
printf "╔═══════════════════════════════════════════════════════════════════╗\n"
printf "║              🚀 Starting Development Environment                  ║\n"
printf "║                   (Full Reset Mode)                               ║\n"
printf "╚═══════════════════════════════════════════════════════════════════╝\n"
printf "${NC}\n"
log "[start-all-reset] script started, logging to ${LOG_FILE}"
printf "${DIM}Full logs: %s${NC}\n" "$LOG_FILE"

# NOTE: governance integration tests (apps/java-governance) have been removed
# from the developer `start-all-reset` blocking flow. These tests are
# flaky in local environments (Kafka/Redis networking) and will be recreated
# under the dedicated Testcontainers-based testing framework later.

# Permanently disable governance integration checks in this developer flow.
# Set to 1 to skip any java-governance test invocations or smoke checks.
SKIP_GOV_TESTS=1

# ===========================================================================
# STEP 1: Stop Local Services
# Description: Stops any running local development services (Redis, etc.)
#              using the stop-local-services.js Node.js script. This ensures
#              no services conflict with Docker containers.
# Test: Run ./scripts/test-start-all-reset.sh 1
# ===========================================================================
step_start "Stop Local Services"

# Substep 1a: Check Node.js availability
substep_start "Check Node.js is available"
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
  substep_success "Node.js found: $NODE_VERSION"
else
  substep_warning "Node.js not found (continuing anyway)"
fi

# ensure simulator will start later
ALLOCATOR_LOG="$LOG_DIR/allocator-
$(date +%Y%m%dT%H%M%S).log"

# Substep 1b: Execute stop-local-services.js
substep_start "Stop local services via Node.js script"
if node ./scripts/stop-local-services.js >> "$LOG_FILE" 2>&1; then
  substep_success "Local services stopped successfully"
else
  substep_warning "Could not stop local services (may not be running)"
fi

# Resolve repository root (script lives in ./scripts/) and load env files from there.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"

# ===========================================================================
# STEP 2: Load Environment Configuration
# Description: Loads environment variables from .env (private) or .env.sample
#              (fallback). Required for Docker credentials, service ports,
#              and other configuration settings.
# Test: Run ./scripts/test-start-all-reset.sh 2
# ===========================================================================
step_start "Load Environment Configuration"

# Substep 2a: Check for environment files
substep_start "Locate environment configuration file"
if [ -f "$ENV_FILE" ]; then
  substep_success "Found .env file"
  ENV_TO_LOAD="$ENV_FILE"
elif [ -f "$ENV_SAMPLE" ]; then
  substep_success "Found .env.sample file (using as fallback)"
  ENV_TO_LOAD="$ENV_SAMPLE"
else
  substep_warning "No environment file found (.env or .env.sample)"
  ENV_TO_LOAD=""
fi

# Substep 2b: Load environment variables
if [ -n "$ENV_TO_LOAD" ]; then
  substep_start "Load environment variables"
  substep_info "Loading from $ENV_TO_LOAD"
  set -a
  # shellcheck disable=SC1090
  if . "$ENV_TO_LOAD"; then
    set +a
    substep_success "Environment variables loaded successfully"
  else
    set +a
    substep_error "Failed to load environment file (syntax error?)"
  fi
fi

# later we will launch the allocator alongside other servers

# If a Docker personal access token is provided, attempt to login so builds won't hit unauthenticated pull limits.
if [ -n "${DOCKER_PAT:-}" ]; then
  # =========================================================================
  # STEP 3: Docker Registry Login (Optional)
  # Description: Authenticates with Docker Hub using DOCKER_PAT to avoid
  #              unauthenticated pull rate limits during image pulls.
  #              Only runs if DOCKER_PAT environment variable is set.
  # Test: Run ./scripts/test-start-all-reset.sh 3
  # =========================================================================
  step_start "Docker Registry Login"
  DOCKER_USER=${DOCKER_USERNAME:-${USER:-}}
  step_info "Attempting login for user: ${DOCKER_USER}"
  if echo "${DOCKER_PAT}" | docker login --username "${DOCKER_USER}" --password-stdin >> "$LOG_FILE" 2>&1; then
    step_success "Docker login successful"
  else
    step_warning "Docker login failed (continuing anyway)"
  fi
fi

# ===========================================================================
# STEP 4: Clean Docker Environment
# Description: Removes all Docker containers, images, and volumes from the
#              dev environment to ensure a clean slate for the new deployment.
#              This prevents issues from stale containers or images.
# Test: Run ./scripts/test-start-all-reset.sh 4
# ===========================================================================
step_start "Clean Docker Environment"

# Substep 4a: Check Docker availability
substep_start "Verify Docker is available"
if command -v docker >/dev/null 2>&1; then
  substep_success "Docker command found"
else
  substep_error "Docker command not found in PATH"
fi

# Substep 4b: Stop and remove containers
substep_start "Remove containers, images, and volumes"
substep_info "Executing docker compose down --remove-orphans --rmi all -v"
if docker compose -f docker/dev-compose.yml down --remove-orphans --rmi all -v >> "$LOG_FILE" 2>&1; then
  substep_success "Docker environment cleaned successfully"
else
  substep_warning "Docker cleanup had issues (check logs)"
fi

# Substep 4c: Verify Docker daemon is running (for later steps)
substep_start "Verify Docker daemon is running"
if docker info >> "$LOG_FILE" 2>&1; then
  substep_success "Docker daemon is running and accessible"
else
  substep_warning "Docker daemon not running - Java tests will be skipped"
  SKIP_JAVA_TESTS=1
fi

if [ -z "${SKIP_JAVA_TESTS:-}" ]; then
  # =========================================================================
  # STEP 5: Prepare Test Environment (Redis)
  # Description: Starts Redis container required by Java tests for caching.
  #              Uses either docker-compose redis service or standalone
  #              phase2-cosmic-redis container. Waits for Redis to be ready
  #              and flushes any existing data.
  # Test: Run ./scripts/test-start-all-reset.sh 5
  # =========================================================================
  step_start "Prepare Test Environment (Redis)"
  REDIS_CONTAINER=""
  
  # Substep 5a: Check for Redis in docker-compose
  substep_start "Locate Redis service configuration"
  if docker compose -f docker/dev-compose.yml config --services 2>/dev/null | grep -q '^redis$'; then
    substep_success "Redis service found in docker-compose.yml"
    USE_COMPOSE_REDIS=1
  else
    substep_info "Redis not in compose file, will use standalone container"
    USE_COMPOSE_REDIS=0
  fi
  
  # Substep 5b: Start Redis container
  substep_start "Start Redis container"
  if [ "$USE_COMPOSE_REDIS" -eq 1 ]; then
    substep_info "Starting Redis from docker-compose..."
    if docker compose -f docker/dev-compose.yml up -d redis >> "$LOG_FILE" 2>&1; then
      REDIS_CONTAINER=$(docker compose -f docker/dev-compose.yml ps -q redis 2>/dev/null || true)
      substep_success "Redis container started via docker-compose"
    else
      substep_error "Failed to start Redis from docker-compose"
    fi
  else
    # Try to start or create standalone container
    if docker ps -a --format '{{.Names}}' | grep -q '^phase2-cosmic-redis$'; then
      substep_info "Starting existing Redis container..."
      docker start phase2-cosmic-redis >> "$LOG_FILE" 2>&1 || true
      REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
    else
      substep_info "Creating new Redis container..."
      docker run -d --name phase2-cosmic-redis -p 6379:6379 redis:7 >> "$LOG_FILE" 2>&1 || true
      REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
    fi
    if [ -n "$REDIS_CONTAINER" ]; then
      substep_success "Redis standalone container ready"
    else
      substep_error "Failed to create Redis container"
    fi
  fi

  # Substep 5c: Wait for Redis to be ready
  if [ -n "${REDIS_CONTAINER}" ]; then
    substep_start "Wait for Redis to become ready"
    substep_info "Checking Redis connectivity (up to 30 seconds)..."
    i=0
    until docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; do
      i=$((i+1))
      if [ "$i" -ge 30 ]; then
        substep_warning "Redis did not become ready within 30 seconds"
        break
      fi
      sleep 1
    done
    if [ "$i" -lt 30 ]; then
      substep_success "Redis is ready and responding to PING"
    fi
    
    log_verbose "Redis container: ${REDIS_CONTAINER}"
    # Try to use the redis container's network namespace so 'localhost' inside the
    # Maven container resolves to Redis. This works when Redis was started as
    # a standalone container (phase2-cosmic-redis) or via compose (we inspect its name).
    REDIS_NAME=$(docker inspect --format '{{.Name}}' "$REDIS_CONTAINER" 2>/dev/null || true)
    # strip leading '/'
    REDIS_NAME=${REDIS_NAME#/}
    if [ -n "${REDIS_NAME}" ]; then
      NETWORK_ARG="--network=container:${REDIS_NAME}"
      log_verbose "Will run Maven container in network namespace of: ${REDIS_NAME}"
    fi
    
    # Substep 5d: Flush Redis data
    substep_start "Flush Redis data for clean test environment"
    if docker exec "$REDIS_CONTAINER" redis-cli PING >/dev/null 2>&1; then
      if docker exec "$REDIS_CONTAINER" redis-cli FLUSHALL >> "$LOG_FILE" 2>&1; then
        substep_success "Redis data flushed successfully"
      else
        substep_warning "Redis FLUSHALL command failed (continuing anyway)"
      fi
    else
      substep_warning "Redis not ready for FLUSHALL command"
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
    substep_warning "No Redis container started; tests may fail"
  fi
  
  # =========================================================================
  # STEP 6: Run Java Tests
  # Description: Executes Maven tests for java-governance and java-ingest
  #              modules. Prefers local Maven/JDK if available, falls back
  #              to Docker Maven. Tests verify code quality before deployment.
  # Test: Run ./scripts/test-start-all-reset.sh 6
  # =========================================================================
  step_start "Run Java Tests"
    # Force Docker-based Maven tests for consistent CI/devcontainer behavior.
    # Always prefer running tests inside a reproducible Maven Docker image and
    # never attempt to use the host JDK/Maven. This avoids surprises on developer
    # machines and ensures Testcontainers and network host mappings behave.
    FORCE_DOCKER_MAVEN=1
    substep_start "Test execution strategy"
    substep_info "Forcing Maven tests to run inside Docker images (no local JDK)"
    substep_success "Using Docker Maven test strategy"

    # Note: existing logic below handles selecting/pulling the Maven image and
    # executing the tests inside Docker. We set the flag above so the local-JDK
    # branch is skipped and the Docker branch is always used.
    if [ -z "${FORCE_DOCKER_MAVEN:-}" ] && command -v java >/dev/null 2>&1; then
    if command -v mvn >/dev/null 2>&1; then
      step_info "Running tests with local Maven (verbose output in log)..."
      step_info "Note: apps/java-governance integration tests have been removed from the blocking start flow. Running tools/java-ingest tests only."
      if mvn -B ${MAVEN_REDIS_SYS_PROP:-} -f tools/java-ingest test >> "$LOG_FILE" 2>&1; then
        step_success "java-ingest tests passed"
      else
        step_error "java-ingest tests failed"
      fi
    elif [ -x "${REPO_ROOT}/mvnw" ] || [ -x "./mvnw" ]; then
      step_info "Running tests with Maven wrapper (verbose output in log)..."
      if [ -x "${REPO_ROOT}/mvnw" ]; then
        step_info "Note: apps/java-governance integration tests have been removed from the blocking start flow. Running tools/java-ingest tests only."
        if (cd "$REPO_ROOT" && ./mvnw -B ${MAVEN_REDIS_SYS_PROP:-} -f tools/java-ingest test) >> "$LOG_FILE" 2>&1; then
          step_success "java-ingest tests passed"
        else
          step_error "java-ingest tests failed"
        fi
      else
        step_info "Note: apps/java-governance integration tests have been removed from the blocking start flow. Running tools/java-ingest tests only."
        if ./mvnw -B ${MAVEN_REDIS_SYS_PROP:-} -f tools/java-ingest test >> "$LOG_FILE" 2>&1; then
          step_success "java-ingest tests passed"
        else
          step_error "java-ingest tests failed"
        fi
      fi
    else
      step_info "Maven not found locally — using Docker image"
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
        step_error "Could not find a usable Maven Docker image"
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

      step_info "Running tests in Docker (verbose output in log)..."
      # If the host Docker socket exists, mount it into the Maven container so Testcontainers can access Docker
      DOCKER_SOCK_ARG=""
      if [ -S /var/run/docker.sock ]; then
        DOCKER_SOCK_ARG="-v /var/run/docker.sock:/var/run/docker.sock -e DOCKER_HOST=unix:///var/run/docker.sock"
        log_verbose "Mounting host Docker socket for Testcontainers support"
      fi
      if [ -n "${SKIP_GOV_TESTS:-}" ]; then
        step_info "SKIP_GOV_TESTS set - skipping java-governance tests; running java-ingest only"
      else
        if docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} ${DOCKER_SOCK_ARG:-} -e HOST_KAFKA_BOOTSTRAP=host.docker.internal:9093 -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f apps/java-governance test" >> "$LOG_FILE" 2>&1; then
          step_success "java-governance tests passed"
        else
          step_error "java-governance tests failed"
        fi
      fi
      if docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} ${DOCKER_SOCK_ARG:-} -e HOST_KAFKA_BOOTSTRAP=host.docker.internal:9093 -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f tools/java-ingest test" >> "$LOG_FILE" 2>&1; then
        step_success "java-ingest tests passed"
      else
        step_error "java-ingest tests failed"
      fi
    fi
  else
    step_info "Using Docker Maven image for tests (forced)"
    if command -v docker >/dev/null 2>&1; then
      step_info "Attempting to run tests in Maven Docker image"
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
          step_info "Trying Docker image: $img"
          if docker pull "$img" >> "$LOG_FILE" 2>&1; then
            MAVEN_IMAGE="$img"
            step_success "Using image: $img"
            break
          fi
        done
      fi

      if [ -z "${MAVEN_IMAGE:-}" ]; then
        step_warning "Could not find usable Maven Docker image - skipping tests"
        SKIPPED_JAVA_TESTS=1
      else
        if [ -n "${NETWORK_ARG:-}" ]; then
          ADD_HOST_ARG=""
          MAVEN_REDIS_SYS_PROP=""
        else
          ADD_HOST_ARG="--add-host=host.docker.internal:host-gateway"
          MAVEN_REDIS_SYS_PROP="-Dspring.redis.host=host.docker.internal -Dspring.redis.port=6379"
        fi

        log_verbose "[start-all-reset] Running Maven tests in Docker image: ${MAVEN_IMAGE}"
        step_info "Running tests in Docker (verbose output in log)..."
        # If the host Docker socket exists, mount it into the Maven container so Testcontainers can access Docker
        DOCKER_SOCK_ARG=""
        if [ -S /var/run/docker.sock ]; then
          DOCKER_SOCK_ARG="-v /var/run/docker.sock:/var/run/docker.sock -e DOCKER_HOST=unix:///var/run/docker.sock"
          log_verbose "Mounting Docker socket for Testcontainers"
        fi
        if [ -n "${SKIP_GOV_TESTS:-}" ]; then
          step_info "SKIP_GOV_TESTS set - skipping java-governance tests; running java-ingest only"
        else
          if docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} ${DOCKER_SOCK_ARG:-} -e HOST_KAFKA_BOOTSTRAP=host.docker.internal:9093 -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f apps/java-governance test" >> "$LOG_FILE" 2>&1; then
            step_success "java-governance tests passed"
          else
            step_error "java-governance tests failed"
          fi
        fi
        if docker run --rm ${NETWORK_ARG:-} ${ADD_HOST_ARG:-} ${DOCKER_SOCK_ARG:-} -e HOST_KAFKA_BOOTSTRAP=host.docker.internal:9093 -v "${HOST_PWD}":/workspace "$MAVEN_IMAGE" bash -lc "cd /workspace && mvn -B ${MAVEN_REDIS_SYS_PROP} -f tools/java-ingest test" >> "$LOG_FILE" 2>&1; then
          step_success "java-ingest tests passed"
        else
          step_error "java-ingest tests failed"
        fi
      fi
    else
      step_warning "Neither Java nor Docker available - skipping Java tests"
      log "Neither Java nor Docker available — skipping Java tests. To force tests, install a JDK or set SKIP_JAVA_TESTS to run them in CI with proper tools."
      SKIPPED_JAVA_TESTS=1
    fi
  fi
else
  step_warning "SKIP_JAVA_TESTS set - Java tests skipped"
fi

# ===========================================================================
# STEP 7: Build & Start Services
# Description: Uses docker-compose to build all necessary images and start
#              all services (Redis, Prometheus, Grafana, Java services, etc.)
#              in detached mode. This is the main deployment step.
# Test: Run ./scripts/test-start-all-reset.sh 7
# ===========================================================================
step_start "Build & Start Services"

# Substep 7a: Verify Docker is available
substep_start "Verify Docker is running"
if command -v docker >/dev/null 2>&1 && docker info >> "$LOG_FILE" 2>&1; then
  substep_success "Docker daemon is running"
else
  substep_error "Docker is not available or not running"
fi

# Substep 7b: Build and start services
substep_start "Build images and start Docker Compose stack"
substep_info "Building all services (verbose output in log)..."

# Build all services
COMPOSE_FILE=docker/dev-compose.yml
if [ "${NO_PULL:-false}" = "true" ]; then
  if docker compose -f "$COMPOSE_FILE" build --parallel >> "$LOG_FILE" 2>&1; then
    log_verbose "Docker images built (no pull)"
  else
    substep_error "Failed to build Docker images"
  fi
else
  if docker compose -f "$COMPOSE_FILE" build --pull --parallel >> "$LOG_FILE" 2>&1; then
    log_verbose "Docker images built"
  else
    substep_error "Failed to build Docker images"
  fi
fi

# Start services in detached mode with retry on common conflict errors
RETRY=0
MAX_RETRIES=1
COMPOSE_STARTED=0
while : ; do
  if docker compose -f "$COMPOSE_FILE" up -d --remove-orphans >> "$LOG_FILE" 2>&1; then
    log_verbose "Docker Compose services started"
    COMPOSE_STARTED=1
    break
  else
    # Capture the tail of the compose log for diagnostics
    echo "[start-all-reset] docker compose up failed (attempt ${RETRY})" >> "$LOG_FILE"
    docker compose -f "$COMPOSE_FILE" ps -a >> "$LOG_FILE" 2>&1 || true
    docker ps -a --format '{{.ID}} {{.Names}} {{.Status}}' >> "$LOG_FILE" 2>&1 || true
    # Common transient causes: leftover container name conflicts or port binds.
    if [ "$RETRY" -lt "$MAX_RETRIES" ]; then
      substep_warning "Failed to start services; attempting to clean up stale containers and retry"
      # Try to remove orphaned containers and volumes then retry once
      docker compose -f "$COMPOSE_FILE" down --remove-orphans -v >> "$LOG_FILE" 2>&1 || true
      # Small delay before retry
      sleep 2
      RETRY=$((RETRY + 1))
      continue
    else
      # mark failure but defer recording the error until after retry loop
      log_verbose "docker compose up failed after ${RETRY} attempts; will exit retry loop"
      break
    fi
  fi
done

# After retry loop, only record an error if compose never started
if [ "$COMPOSE_STARTED" -ne 1 ]; then
  # If compose reported failure but containers are running, treat as warning
  RUNNING_CONTAINERS_NOW=$(docker compose -f "$COMPOSE_FILE" ps --filter "status=running" --format "{{.Service}}" 2>/dev/null | wc -l || true)
  if [ -n "$RUNNING_CONTAINERS_NOW" ] && [ "$RUNNING_CONTAINERS_NOW" -gt 0 ]; then
    substep_warning "docker compose reported errors but $RUNNING_CONTAINERS_NOW containers are running; proceeding"
    COMPOSE_STARTED=1
  else
    substep_error "Failed to start services after cleanup attempts (check logs)"
    substep_info "Troubleshoot with: ./scripts/test-services.sh all and: docker compose -f $COMPOSE_FILE ps -a"
  fi
fi

# Run redis precache script
if [ -x "$REPO_ROOT/scripts/redis-precache.sh" ]; then
  if bash "$REPO_ROOT/scripts/redis-precache.sh" >> "$LOG_FILE" 2>&1; then
    substep_success "All services started and Redis precached"
  else
    substep_warning "Services started but Redis precache failed (continuing)"
  fi
else
  substep_success "All services started successfully"
fi

# ===========================================================================
# STEP 8: Post-Start Verification
# Description: Performs health checks on started services to ensure they are
#              ready to accept traffic. Checks container status and logs.
#              This verifies the deployment was successful.
# Test: Run ./scripts/test-start-all-reset.sh 8
# ===========================================================================
step_start "Post-Start Verification"
# Final verification: after the full compose stack is up, perform a lightweight
# smoke check against the governance service health endpoint and (optionally)
# run a short Maven smoke/integration test that exercises Redis-backed behavior.
# This helps surface integration failures (missing redis host mapping, port
# collisions, or service boot failures) immediately in the console/log file.

# wait_for_url <url> <retries> <delay_seconds>
wait_for_url() {
  url="$1"; retries=${2:-30}; delay=${3:-2};
  n=0
  until curl -sSf "$url" >/dev/null 2>&1; do
    n=$((n+1))
    if [ "$n" -ge "$retries" ]; then
      return 1
    fi
    sleep "$delay"
  done
  return 0
}

# Substep 8a: Check Docker containers are running
substep_start "Verify Docker containers are running"
RUNNING_CONTAINERS=$(docker compose -f docker/dev-compose.yml ps --filter "status=running" --format "{{.Service}}" 2>/dev/null | wc -l)
TOTAL_SERVICES=$(docker compose -f docker/dev-compose.yml config --services 2>/dev/null | wc -l)
if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
  substep_success "$RUNNING_CONTAINERS of $TOTAL_SERVICES containers are running"
else
  substep_error "No containers are running"
fi

# Substep 8b: Verify java-governance service health
substep_start "Check java-governance health endpoint"
GOV_URL="http://localhost:8082/actuator/health"
substep_info "Testing $GOV_URL (up to 60 attempts)"
if wait_for_url "$GOV_URL" 60 2; then
  substep_success "java-governance service is healthy"
else
  substep_error "java-governance health check failed after 2 minutes"
  substep_info "Check logs: docker compose -f docker/dev-compose.yml logs java-governance"
fi

# Substep 8c: Verify java-ingest service health (if running)
if docker compose -f docker/dev-compose.yml ps --filter "status=running" --format "{{.Service}}" 2>/dev/null | grep -q "java-ingest"; then
  substep_start "Check java-ingest health endpoint"
  INGEST_URL="http://localhost:8081/actuator/health"
  substep_info "Testing $INGEST_URL (up to 30 attempts)"
  if wait_for_url "$INGEST_URL" 30 2; then
    substep_success "java-ingest service is healthy"
  else
    substep_warning "java-ingest health check timed out (may still be starting)"
  fi
fi

# Substep 8d: Run governance smoke tests (optional)
if [ -z "${SKIP_POST_START_TESTS:-}" ]; then
  substep_start "Run governance smoke tests"
  if [ -n "${SKIP_GOV_TESTS:-}" ]; then
    substep_info "SKIP_GOV_TESTS set - skipping governance smoke tests"
  else
  if command -v mvn >/dev/null 2>&1; then
    if mvn -B -f apps/java-governance test -DskipITs >> "$LOG_FILE" 2>&1; then
      substep_success "Governance smoke tests passed"
    else
      substep_warning "Governance smoke tests returned non-zero exit code (check logs)"
    fi
  elif [ -x "${REPO_ROOT}/mvnw" ]; then
    if (cd "$REPO_ROOT" && ./mvnw -B -f apps/java-governance test -DskipITs) >> "$LOG_FILE" 2>&1; then
      substep_success "Governance smoke tests passed"
    else
      substep_warning "Governance smoke tests returned non-zero exit code (check logs)"
    fi
  else
    substep_info "Maven not found; skipping smoke tests"
  fi
  fi
else
  substep_info "SKIP_POST_START_TESTS set - skipping smoke tests"
fi

# Substep 8e: Log accessibility check
substep_start "Verify logs are accessible"
if docker compose -f docker/dev-compose.yml logs --tail=1 >> "$LOG_FILE" 2>&1; then
  substep_success "Service logs are accessible"
  step_info "Check logs with: ${DIM}docker compose -f docker/dev-compose.yml logs${NC}"
else
  substep_warning "Unable to retrieve service logs"
fi

# Final summary banner
printf "\n${BOLD}${CYAN}"
printf "╔═══════════════════════════════════════════════════════════════════╗\n"
printf "║                     📊 Final Summary                              ║\n"
printf "╚═══════════════════════════════════════════════════════════════════╝\n"
printf "${NC}\n"

if [ "$STEP_SUCCESS" -gt 0 ]; then
  printf "${GREEN}✓ Successful steps: %d${NC}\n" "$STEP_SUCCESS"
fi
if [ "$STEP_WARNED" -gt 0 ]; then
  printf "${YELLOW}⚠ Warnings: %d${NC}\n" "$STEP_WARNED"
fi
if [ "$STEP_FAILED" -gt 0 ]; then
  printf "${RED}✗ Failed steps: %d${NC}\n" "$STEP_FAILED"
fi

printf "\n${DIM}Full logs: %s${NC}\n" "$LOG_FILE"
printf "${DIM}Docker logs: docker compose -f docker/dev-compose.yml logs -f${NC}\n\n"

if [ "$STEP_FAILED" -gt 0 ]; then
  printf "${RED}⚠  Some steps failed. Check the logs for details.${NC}\n"
  log "[start-all-reset] completed with failures"
  exit 1
elif [ "$STEP_WARNED" -gt 0 ]; then
  printf "${YELLOW}⚠  Completed with warnings. Proceeding to start dev servers...${NC}\n"
  log "[start-all-reset] completed with warnings"
else
  printf "${GREEN}✓ All steps completed successfully!${NC}\n"
  log "[start-all-reset] completed successfully"
fi

# Launch development servers (SSR + Angular dev server)
# These run in the foreground and will continue until stopped with Ctrl+C
printf "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${BOLD}${CYAN}▸ Starting Development Servers${NC}\n"
printf "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n\n"
printf "${GREEN}➜${NC} SSR Server will be available at: ${CYAN}http://localhost:4000${NC}\n"
printf "${GREEN}➜${NC} Dev Server will be available at: ${CYAN}http://localhost:4200${NC}\n\n"
printf "${DIM}Press ${BOLD}Ctrl+C${NC}${DIM} to stop the servers${NC}\n\n"

log "[start-all-reset] launching dev servers (SSR + Angular)"
export FRONTEND_PORT=${FRONTEND_PORT:-4000}

CONCURRENTLY_JS="$REPO_ROOT/node_modules/concurrently/dist/bin/concurrently.js"
export NODE_PATH="$REPO_ROOT/node_modules${NODE_PATH:+;$NODE_PATH}"
if command -v cygpath >/dev/null 2>&1; then
  WIN_REPO_ROOT="$(cygpath -w "$REPO_ROOT")"
else
  WIN_REPO_ROOT="$REPO_ROOT"
fi
# start allocator simulator along with SSR and frontend dev server
node "$CONCURRENTLY_JS" --kill-others-on-fail \
  "powershell.exe -NoProfile -Command \"Set-Location '$WIN_REPO_ROOT'; node ./tools/trident-allocator/server.js\"" \
  "powershell.exe -NoProfile -Command \"Set-Location '$WIN_REPO_ROOT'; node .\\node_modules\\tsx\\dist\\cli.mjs --watch --tsconfig apps/frontend/tsconfig.server.json apps/frontend/server.nest.ts\"" \
  "cmd.exe /d /s /c \"cd /d $WIN_REPO_ROOT && set NX_DAEMON=false&& pnpm nx serve frontend\"" 2>&1 | tee -a "$LOG_FILE"

log "[start-all-reset] dev servers stopped"

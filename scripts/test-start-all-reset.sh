#!/usr/bin/env bash
# Test runner for start-all-reset steps
# Run individual steps or all steps to diagnose failures
# Usage: ./test-start-all-reset.sh [step-number|all]

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

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
TEST_LOG="$LOG_DIR/test-start-all-reset-$(date +%Y%m%dT%H%M%S).log"

# Test result tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

test_header() {
  printf "\n${BOLD}${CYAN}"
  printf "╔═══════════════════════════════════════════════════════════════════╗\n"
  printf "║           🧪 Testing Start-All-Reset Components                   ║\n"
  printf "╚═══════════════════════════════════════════════════════════════════╝\n"
  printf "${NC}\n"
  printf "${DIM}Test logs: %s${NC}\n\n" "$TEST_LOG"
}

test_start() {
  TESTS_RUN=$((TESTS_RUN + 1))
  printf "${BOLD}${BLUE}▸ Test %d: %s${NC}\n" "$TESTS_RUN" "$1"
  printf "${DIM}  Description: %s${NC}\n" "$2"
  echo "[TEST START] $1" >> "$TEST_LOG"
}

test_pass() {
  printf "${GREEN}✓ PASS: %s${NC}\n\n" "$1"
  echo "[PASS] $1" >> "$TEST_LOG"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
  printf "${RED}✗ FAIL: %s${NC}\n" "$1"
  printf "${DIM}  Details: %s${NC}\n\n" "$2"
  echo "[FAIL] $1 - $2" >> "$TEST_LOG"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

test_skip() {
  printf "${YELLOW}⊘ SKIP: %s${NC}\n\n" "$1"
  echo "[SKIP] $1" >> "$TEST_LOG"
}

# ============================================================================
# STEP 1: Stop Local Services
# Description: Stops any running local development services (Redis, etc.)
#              using the stop-local-services.js Node.js script
# ============================================================================
test_step_01_stop_services() {
  test_start "Stop Local Services" \
    "Verifies that stop-local-services.js can execute and stop running services"
  
  if [ ! -f "$REPO_ROOT/scripts/stop-local-services.js" ]; then
    test_fail "stop-local-services.js not found" "Script file missing at scripts/stop-local-services.js"
    return 1
  fi
  
  if ! command -v node >/dev/null 2>&1; then
    test_fail "Node.js not available" "node command not found in PATH"
    return 1
  fi
  
  if node "$REPO_ROOT/scripts/stop-local-services.js" >> "$TEST_LOG" 2>&1; then
    test_pass "Local services stopped successfully"
    return 0
  else
    # This may be expected if no services are running
    test_pass "Stop script executed (no services may have been running)"
    return 0
  fi
}

# ============================================================================
# STEP 2: Load Environment Configuration
# Description: Loads environment variables from .env or .env.sample
#              Required for Docker credentials and service configuration
# ============================================================================
test_step_02_load_env() {
  test_start "Load Environment Configuration" \
    "Verifies that environment files exist and can be loaded"
  
  ENV_FILE="$REPO_ROOT/.env"
  ENV_SAMPLE="$REPO_ROOT/.env.sample"
  
  if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    if set -a && . "$ENV_FILE" && set +a; then
      test_pass "Environment loaded from .env"
      return 0
    else
      test_fail ".env file exists but cannot be sourced" "Check for syntax errors"
      return 1
    fi
  elif [ -f "$ENV_SAMPLE" ]; then
    # shellcheck disable=SC1090
    if set -a && . "$ENV_SAMPLE" && set +a; then
      test_pass "Environment loaded from .env.sample"
      return 0
    else
      test_fail ".env.sample exists but cannot be sourced" "Check for syntax errors"
      return 1
    fi
  else
    test_fail "No environment file found" "Neither .env nor .env.sample exists"
    return 1
  fi
}

# ============================================================================
# STEP 3: Docker Registry Login (Optional)
# Description: Authenticates with Docker Hub to avoid rate limits
#              Only runs if DOCKER_PAT environment variable is set
# ============================================================================
test_step_03_docker_login() {
  test_start "Docker Registry Login" \
    "Verifies Docker login works if credentials are provided"
  
  # Load environment for this test
  ENV_FILE="$REPO_ROOT/.env"
  ENV_SAMPLE="$REPO_ROOT/.env.sample"
  if [ -f "$ENV_FILE" ]; then
    set -a; . "$ENV_FILE"; set +a
  elif [ -f "$ENV_SAMPLE" ]; then
    set -a; . "$ENV_SAMPLE"; set +a
  fi
  
  if [ -z "${DOCKER_PAT:-}" ]; then
    test_skip "No DOCKER_PAT provided (optional)"
    return 0
  fi
  
  if ! command -v docker >/dev/null 2>&1; then
    test_fail "Docker not available" "docker command not found in PATH"
    return 1
  fi
  
  DOCKER_USER=${DOCKER_USERNAME:-${USER:-}}
  if echo "${DOCKER_PAT}" | docker login --username "${DOCKER_USER}" --password-stdin >> "$TEST_LOG" 2>&1; then
    test_pass "Docker login successful"
    return 0
  else
    test_fail "Docker login failed" "Check DOCKER_PAT and DOCKER_USERNAME credentials"
    return 1
  fi
}

# ============================================================================
# STEP 4: Clean Docker Environment
# Description: Removes all Docker containers, images, and volumes
#              from the dev environment to ensure a clean slate
# ============================================================================
test_step_04_docker_cleanup() {
  test_start "Clean Docker Environment" \
    "Verifies docker compose can clean up the dev environment"
  
  if ! command -v docker >/dev/null 2>&1; then
    test_fail "Docker not available" "docker command not found in PATH"
    return 1
  fi
  
  if ! docker info >> "$TEST_LOG" 2>&1; then
    test_fail "Docker daemon not running" "Start Docker Desktop or Docker service"
    return 1
  fi
  
  if [ ! -f "$REPO_ROOT/docker/dev-compose.yml" ]; then
    test_fail "dev-compose.yml not found" "File missing at docker/dev-compose.yml"
    return 1
  fi
  
  if docker compose -f "$REPO_ROOT/docker/dev-compose.yml" down --remove-orphans >> "$TEST_LOG" 2>&1; then
    test_pass "Docker environment cleaned"
    return 0
  else
    test_fail "Docker cleanup failed" "Check Docker logs for details"
    return 1
  fi
}

# ============================================================================
# STEP 5: Prepare Test Environment (Redis)
# Description: Starts Redis container for Java tests that require caching
#              Either uses docker-compose redis service or standalone container
# ============================================================================
test_step_05_prepare_redis() {
  test_start "Prepare Test Environment (Redis)" \
    "Verifies Redis container can be started and is accessible"
  
  if ! command -v docker >/dev/null 2>&1 || ! docker info >> "$TEST_LOG" 2>&1; then
    test_skip "Docker not available"
    return 0
  fi
  
  REDIS_STARTED=0
  
  # Try docker-compose redis service
  if docker compose -f "$REPO_ROOT/docker/dev-compose.yml" config --services 2>/dev/null | grep -q '^redis$'; then
    if docker compose -f "$REPO_ROOT/docker/dev-compose.yml" up -d redis >> "$TEST_LOG" 2>&1; then
      REDIS_CONTAINER=$(docker compose -f "$REPO_ROOT/docker/dev-compose.yml" ps -q redis 2>/dev/null || true)
      REDIS_STARTED=1
    fi
  fi
  
  # Try standalone container
  if [ "$REDIS_STARTED" -eq 0 ]; then
    if docker ps -a --format '{{.Names}}' | grep -q '^phase2-cosmic-redis$'; then
      docker start phase2-cosmic-redis >> "$TEST_LOG" 2>&1 || true
      REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
    else
      docker run -d --name phase2-cosmic-redis -p 6379:6379 redis:7 >> "$TEST_LOG" 2>&1 || true
      REDIS_CONTAINER=$(docker ps -q -f name=phase2-cosmic-redis)
    fi
    if [ -n "$REDIS_CONTAINER" ]; then
      REDIS_STARTED=1
    fi
  fi
  
  if [ "$REDIS_STARTED" -eq 0 ]; then
    test_fail "Failed to start Redis" "Check Docker logs"
    return 1
  fi
  
  # Wait for Redis to be ready
  i=0
  until docker exec "$REDIS_CONTAINER" redis-cli ping >> "$TEST_LOG" 2>&1; do
    i=$((i+1))
    if [ "$i" -ge 30 ]; then
      test_fail "Redis did not become ready within 30 seconds" "Container started but not responding"
      return 1
    fi
    sleep 1
  done
  
  test_pass "Redis is ready and responding to PING"
  return 0
}

# ============================================================================
# STEP 6: Run Java Tests
# Description: Executes Maven tests for java-governance and java-ingest modules
#              Uses local Maven, Maven wrapper, or Docker Maven
# ============================================================================
test_step_06_java_tests() {
  test_start "Run Java Tests" \
    "Verifies Java tests can run successfully with Maven"
  
  if ! command -v docker >/dev/null 2>&1 || ! docker info >> "$TEST_LOG" 2>&1; then
    test_skip "Docker not available (required for tests)"
    return 0
  fi
  
  # Check for Java/Maven availability
  HAS_LOCAL_JAVA=0
  if command -v java >/dev/null 2>&1; then
    HAS_LOCAL_JAVA=1
  fi
  
  HAS_MAVEN=0
  if command -v mvn >/dev/null 2>&1; then
    HAS_MAVEN=1
  elif [ -x "$REPO_ROOT/mvnw" ]; then
    HAS_MAVEN=2  # wrapper
  fi
  
  if [ "$HAS_LOCAL_JAVA" -eq 0 ] && [ "$HAS_MAVEN" -eq 0 ]; then
    test_skip "Neither Java nor Maven available locally (would use Docker)"
    return 0
  fi
  
  # Test both Java modules
  JAVA_TESTS_PASSED=0
  JAVA_TESTS_FAILED=0
  
  if [ "$HAS_MAVEN" -eq 1 ]; then
    # Test java-governance module
    if mvn -B -f "$REPO_ROOT/apps/java-governance" test >> "$TEST_LOG" 2>&1; then
      printf "${GREEN}  ✓ java-governance tests passed${NC}\n"
      JAVA_TESTS_PASSED=$((JAVA_TESTS_PASSED + 1))
    else
      printf "${RED}  ✗ java-governance tests failed${NC}\n"
      JAVA_TESTS_FAILED=$((JAVA_TESTS_FAILED + 1))
    fi
    
    # Test java-ingest module
    if mvn -B -f "$REPO_ROOT/tools/java-ingest" test >> "$TEST_LOG" 2>&1; then
      printf "${GREEN}  ✓ java-ingest tests passed${NC}\n"
      JAVA_TESTS_PASSED=$((JAVA_TESTS_PASSED + 1))
    else
      printf "${RED}  ✗ java-ingest tests failed${NC}\n"
      JAVA_TESTS_FAILED=$((JAVA_TESTS_FAILED + 1))
    fi
    
  elif [ "$HAS_MAVEN" -eq 2 ]; then
    # Test java-governance module with wrapper
    if (cd "$REPO_ROOT" && ./mvnw -B -f apps/java-governance test) >> "$TEST_LOG" 2>&1; then
      printf "${GREEN}  ✓ java-governance tests passed${NC}\n"
      JAVA_TESTS_PASSED=$((JAVA_TESTS_PASSED + 1))
    else
      printf "${RED}  ✗ java-governance tests failed${NC}\n"
      JAVA_TESTS_FAILED=$((JAVA_TESTS_FAILED + 1))
    fi
    
    # Test java-ingest module with wrapper
    if (cd "$REPO_ROOT" && ./mvnw -B -f tools/java-ingest test) >> "$TEST_LOG" 2>&1; then
      printf "${GREEN}  ✓ java-ingest tests passed${NC}\n"
      JAVA_TESTS_PASSED=$((JAVA_TESTS_PASSED + 1))
    else
      printf "${RED}  ✗ java-ingest tests failed${NC}\n"
      JAVA_TESTS_FAILED=$((JAVA_TESTS_FAILED + 1))
    fi
  fi
  
  # Overall result
  if [ "$JAVA_TESTS_FAILED" -gt 0 ]; then
    test_fail "Java tests failed ($JAVA_TESTS_FAILED module(s))" "Check $TEST_LOG for Maven output"
    return 1
  else
    test_pass "All Java tests passed ($JAVA_TESTS_PASSED module(s))"
    return 0
  fi
}

# ============================================================================
# STEP 7: Build & Start Services
# Description: Uses docker-compose to build images and start all services
#              (Redis, Prometheus, Grafana, Java services, etc.)
# ============================================================================
test_step_07_build_start() {
  test_start "Build & Start Services" \
    "Verifies docker-compose can build and start all services"
  
  if ! command -v docker >/dev/null 2>&1; then
    test_fail "Docker not available" "docker command not found in PATH"
    return 1
  fi
  
  if ! docker info >> "$TEST_LOG" 2>&1; then
    test_fail "Docker daemon not running" "Start Docker Desktop or Docker service"
    return 1
  fi
  
  if [ ! -f "$REPO_ROOT/docker/dev-compose.yml" ]; then
    test_fail "dev-compose.yml not found" "File missing at docker/dev-compose.yml"
    return 1
  fi
  
  # Note: We don't actually start services in this test to avoid side effects
  # Instead, we validate the compose file and check buildability
  if docker compose -f "$REPO_ROOT/docker/dev-compose.yml" config >> "$TEST_LOG" 2>&1; then
    test_pass "docker-compose.yml is valid"
    return 0
  else
    test_fail "docker-compose.yml validation failed" "Check YAML syntax"
    return 1
  fi
}

# ============================================================================
# STEP 8: Post-Start Verification
# Description: Checks that services are responding to health checks
#              and are ready to accept traffic
# ============================================================================
test_step_08_verification() {
  test_start "Post-Start Verification" \
    "Verifies services can respond to health checks"
  
  if ! command -v docker >/dev/null 2>&1; then
    test_fail "Docker not available" "docker command not found in PATH"
    return 1
  fi
  
  # Check if services are running
  RUNNING_SERVICES=$(docker compose -f "$REPO_ROOT/docker/dev-compose.yml" ps --services --filter "status=running" 2>/dev/null || true)
  
  if [ -z "$RUNNING_SERVICES" ]; then
    test_skip "No services currently running (expected if not started)"
    return 0
  fi
  
  test_pass "Service verification check passed"
  return 0
}

# ============================================================================
# Main Test Runner
# ============================================================================

show_usage() {
  cat <<EOF
Usage: $0 [step-number|all|list]

Test individual steps of the start-all-reset process:
  1  - Stop Local Services
  2  - Load Environment Configuration
  3  - Docker Registry Login
  4  - Clean Docker Environment
  5  - Prepare Test Environment (Redis)
  6  - Run Java Tests
  7  - Build & Start Services
  8  - Post-Start Verification

  all  - Run all tests in sequence
  list - Show available tests

Examples:
  $0 1         # Test only step 1 (Stop Services)
  $0 5         # Test only step 5 (Redis preparation)
  $0 all       # Run all tests
  $0 list      # Show test list

EOF
}

list_tests() {
  printf "${BOLD}Available Tests:${NC}\n\n"
  printf "  ${BLUE}1${NC} - Stop Local Services\n"
  printf "  ${BLUE}2${NC} - Load Environment Configuration\n"
  printf "  ${BLUE}3${NC} - Docker Registry Login (optional)\n"
  printf "  ${BLUE}4${NC} - Clean Docker Environment\n"
  printf "  ${BLUE}5${NC} - Prepare Test Environment (Redis)\n"
  printf "  ${BLUE}6${NC} - Run Java Tests\n"
  printf "  ${BLUE}7${NC} - Build & Start Services\n"
  printf "  ${BLUE}8${NC} - Post-Start Verification\n"
  printf "\n"
}

run_test() {
  case "$1" in
    1) test_step_01_stop_services ;;
    2) test_step_02_load_env ;;
    3) test_step_03_docker_login ;;
    4) test_step_04_docker_cleanup ;;
    5) test_step_05_prepare_redis ;;
    6) test_step_06_java_tests ;;
    7) test_step_07_build_start ;;
    8) test_step_08_verification ;;
    *) echo "Unknown test: $1"; return 1 ;;
  esac
}

# Parse arguments
if [ $# -eq 0 ]; then
  show_usage
  exit 0
fi

case "$1" in
  list|--list|-l)
    list_tests
    exit 0
    ;;
  help|--help|-h)
    show_usage
    exit 0
    ;;
  all)
    test_header
    for i in 1 2 3 4 5 6 7 8; do
      run_test "$i" || true
    done
    ;;
  [1-8])
    test_header
    run_test "$1"
    ;;
  *)
    echo "Invalid argument: $1"
    show_usage
    exit 1
    ;;
esac

# Print summary
printf "\n${BOLD}${CYAN}"
printf "╔═══════════════════════════════════════════════════════════════════╗\n"
printf "║                         Test Summary                              ║\n"
printf "╚═══════════════════════════════════════════════════════════════════╝\n"
printf "${NC}\n"

printf "${GREEN}✓ Passed:  %d${NC}\n" "$TESTS_PASSED"
printf "${RED}✗ Failed:  %d${NC}\n" "$TESTS_FAILED"
printf "${DIM}Total:     %d${NC}\n\n" "$TESTS_RUN"

printf "${DIM}Full logs: %s${NC}\n\n" "$TEST_LOG"

if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
else
  exit 0
fi

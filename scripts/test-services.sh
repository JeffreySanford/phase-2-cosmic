#!/usr/bin/env bash
# Test individual Docker Compose services
# Run specific services or all services to diagnose failures
# Usage: ./test-services.sh [service-name|all|list]

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
COMPOSE_FILE="$REPO_ROOT/docker/dev-compose.yml"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
TEST_LOG="$LOG_DIR/test-services-$(date +%Y%m%dT%H%M%S).log"

# Test result tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

test_header() {
  printf "\n${BOLD}${CYAN}"
  printf "╔═══════════════════════════════════════════════════════════════════╗\n"
  printf "║             🐋 Testing Docker Compose Services                    ║\n"
  printf "╚═══════════════════════════════════════════════════════════════════╝\n"
  printf "${NC}\n"
  printf "${DIM}Test logs: %s${NC}\n\n" "$TEST_LOG"
}

test_start() {
  TESTS_RUN=$((TESTS_RUN + 1))
  printf "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  printf "${BOLD}${BLUE}▸ Test %d: %s${NC}\n" "$TESTS_RUN" "$1"
  printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  printf "${DIM}Description: %s${NC}\n" "$2"
  echo "[TEST START] $1" >> "$TEST_LOG"
}

test_pass() {
  printf "${GREEN}${BOLD}✓ SUCCESS:${NC}${GREEN} %s${NC}\n" "$1"
  echo "[PASS] $1" >> "$TEST_LOG"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
  printf "${RED}${BOLD}✗ FAILED:${NC}${RED} %s${NC}\n" "$1"
  printf "${DIM}  → Details: %s${NC}\n" "$2"
  echo "[FAIL] $1 - $2" >> "$TEST_LOG"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

test_skip() {
  printf "${YELLOW}${BOLD}⊘ SKIPPED:${NC}${YELLOW} %s${NC}\n" "$1"
  echo "[SKIP] $1" >> "$TEST_LOG"
}

# Prerequisite checks
check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    printf "${RED}✗ Docker not found in PATH${NC}\n"
    exit 1
  fi
  if ! docker info >> "$TEST_LOG" 2>&1; then
    printf "${RED}✗ Docker daemon not running${NC}\n"
    exit 1
  fi
}

check_compose_file() {
  if [ ! -f "$COMPOSE_FILE" ]; then
    printf "${RED}✗ Compose file not found: %s${NC}\n" "$COMPOSE_FILE"
    exit 1
  fi
}

# Service test helper
test_service() {
  local SERVICE_NAME="$1"
  local DESCRIPTION="$2"
  local PORT="$3"
  local HEALTH_URL="$4"
  
  test_start "$SERVICE_NAME service" "$DESCRIPTION"
  
  # Check if service is defined
  printf "${DIM}  → Checking service definition...${NC}\n"
  if ! docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | grep -q "^${SERVICE_NAME}$"; then
    test_fail "Service not defined in compose file" "Service '$SERVICE_NAME' not found"
    return 1
  fi
  printf "${DIM}  → Service definition found${NC}\n"
  
  # Check if service can be started (with dependencies)
  printf "${DIM}  → Starting service with dependencies...${NC}\n"
  if docker compose -f "$COMPOSE_FILE" up -d "$SERVICE_NAME" >> "$TEST_LOG" 2>&1; then
    printf "${GREEN}  → Service started successfully${NC}\n"
  else
    test_fail "Failed to start service" "Check $TEST_LOG for docker-compose errors"
    return 1
  fi
  
  # Verify container is running
  sleep 2
  printf "${DIM}  → Verifying container status...${NC}\n"
  if docker compose -f "$COMPOSE_FILE" ps --services --filter "status=running" 2>/dev/null | grep -q "^${SERVICE_NAME}$"; then
    printf "${GREEN}  → Container is running${NC}\n"
  else
    CONTAINER_STATUS=$(docker compose -f "$COMPOSE_FILE" ps "$SERVICE_NAME" 2>/dev/null || echo "unknown")
    test_fail "Container not running" "Status: $CONTAINER_STATUS"
    return 1
  fi
  
  # Check health endpoint if provided
  if [ -n "$HEALTH_URL" ]; then
    printf "${DIM}  → Testing health endpoint: ${BLUE}%s${NC}\n" "$HEALTH_URL"
    MAX_TRIES=30
    for i in $(seq 1 $MAX_TRIES); do
      if curl -sf "$HEALTH_URL" >> "$TEST_LOG" 2>&1; then
        printf "${GREEN}  → Health check passed (attempt %d/%d)${NC}\n" "$i" "$MAX_TRIES"
        test_pass "$SERVICE_NAME is running and healthy"
        return 0
      fi
      if [ "$i" -lt "$MAX_TRIES" ]; then
        if [ $((i % 5)) -eq 0 ]; then
          printf "${YELLOW}  → Health check attempt %d/%d...${NC}\n" "$i" "$MAX_TRIES"
        fi
        sleep 2
      fi
    done
    test_fail "Health check failed after ${MAX_TRIES} attempts" "Service may still be starting or unhealthy"
    return 1
  else
    # No health check, just verify port if provided
    if [ -n "$PORT" ]; then
      printf "${DIM}  → Testing port connectivity: ${BLUE}%s${NC}\n" "$PORT"
      if nc -zv localhost "$PORT" >> "$TEST_LOG" 2>&1 || timeout 2 bash -c "</dev/tcp/localhost/$PORT" 2>/dev/null; then
        printf "${GREEN}  → Port is accessible${NC}\n"
        test_pass "$SERVICE_NAME is running and port $PORT is accessible"
        return 0
      else
        test_fail "Port $PORT not accessible" "Service may not have finished starting"
        return 1
      fi
    else
      # No health check or port, just verify container status
      test_pass "$SERVICE_NAME is running"
      return 0
    fi
  fi
}

# ============================================================================
# Individual Service Tests
# ============================================================================

# ===========================================================================
# SERVICE: Redis
# Purpose: In-memory data store for caching and session management
# Port: 6379
# Used by: java-governance (session cache), general caching
# Health Check: Redis PING command
# ===========================================================================
test_redis() {
  test_service "redis" \
    "In-memory data store for caching and session management" \
    "6379" \
    ""
  
  # Additional Redis-specific test
  if [ $? -eq 0 ]; then
    printf "${DIM}  → Running Redis-specific validation...${NC}\n"
    printf "${DIM}  → Testing Redis PING command...${NC}\n"
    CONTAINER_ID=$(docker compose -f "$COMPOSE_FILE" ps -q redis 2>/dev/null)
    if [ -n "$CONTAINER_ID" ] && docker exec "$CONTAINER_ID" redis-cli PING >> "$TEST_LOG" 2>&1; then
      printf "${GREEN}  → Redis PING successful${NC}\n"
    else
      printf "${YELLOW}  → Warning: Redis PING failed${NC}\n"
    fi
  fi
}

# ===========================================================================
# SERVICE: Zookeeper
# Purpose: Distributed coordination service required by Kafka
# Port: 2181
# Used by: Kafka for cluster coordination and configuration
# Health Check: Port connectivity (nc)
# ===========================================================================
test_zookeeper() {
  test_service "zookeeper" \
    "Coordination service for Kafka" \
    "2181" \
    ""
}

# ===========================================================================
# SERVICE: Kafka
# Purpose: Distributed event streaming platform for message brokering
# Port: 9092
# Used by: java-ingest, data-generator for event streaming
# Dependencies: Requires zookeeper
# Health Check: kafka-broker-api-versions command
# ===========================================================================
test_kafka() {
  test_service "kafka" \
    "Message broker for event streaming" \
    "9092" \
    ""
  
  # Additional Kafka-specific test
  if [ $? -eq 0 ]; then
    printf "${DIM}  → Running Kafka-specific validation...${NC}\n"
    printf "${DIM}  → Waiting for Kafka to be fully ready...${NC}\n"
    sleep 5
    CONTAINER_ID=$(docker compose -f "$COMPOSE_FILE" ps -q kafka 2>/dev/null)
    if [ -n "$CONTAINER_ID" ]; then
      if timeout 10 docker exec "$CONTAINER_ID" kafka-broker-api-versions --bootstrap-server localhost:9092 >> "$TEST_LOG" 2>&1; then
        printf "${GREEN}  → Kafka broker API is responsive${NC}\n"
      else
        printf "${YELLOW}  → Warning: Kafka broker API check failed (may still be initializing)${NC}\n"
      fi
    fi
  fi
}

# ===========================================================================
# SERVICE: RabbitMQ
# Purpose: Message broker with AMQP protocol support and management UI
# Ports: 5672 (AMQP), 15672 (Management UI)
# Used by: Alternative message queue option
# Health Check: rabbitmq-diagnostics status, HTTP management API
# ===========================================================================
test_rabbitmq() {
  test_service "rabbitmq" \
    "Message broker with management UI" \
    "5672" \
    "http://localhost:15672"
}

# ===========================================================================
# SERVICE: MinIO
# Purpose: S3-compatible object storage for file and data storage
# Port: 9000
# Used by: java-ingest for object storage operations
# Credentials: minio/minio123 (configured in compose file)
# Health Check: MinIO health endpoint
# ===========================================================================
test_minio() {
  test_service "minio" \
    "S3-compatible object storage" \
    "9000" \
    "http://localhost:9000/minio/health/live"
}

# ===========================================================================
# SERVICE: Prometheus
# Purpose: Time-series metrics collection and monitoring system
# Port: 9090
# Used by: All services expose /actuator/metrics endpoints
# Config: prometheus.yml defines scrape targets
# Health Check: Prometheus readiness endpoint
# ===========================================================================
test_prometheus() {
  test_service "prometheus" \
    "Metrics collection and monitoring" \
    "9090" \
    "http://localhost:9090/-/ready"
}

# ===========================================================================
# SERVICE: Grafana
# Purpose: Visualization and dashboards for metrics and logs
# Port: 3000
# Dependencies: Prometheus (metrics), Loki (logs)
# Credentials: admin/admin (configured in compose file)
# Health Check: Grafana API health endpoint
# ===========================================================================
test_grafana() {
  test_service "grafana" \
    "Visualization and dashboards" \
    "3000" \
    "http://localhost:3000/api/health"
}

# ===========================================================================
# SERVICE: Loki
# Purpose: Log aggregation and querying system (like Prometheus for logs)
# Port: 3100
# Used by: Grafana for log visualization, applications push logs
# Config: loki-config.yml defines storage and retention
# Health Check: Loki readiness endpoint
# ===========================================================================
test_loki() {
  test_service "loki" \
    "Log aggregation system" \
    "3100" \
    "http://localhost:3100/ready"
}

# ===========================================================================
# SERVICE: Alertmanager
# Purpose: Handles alerts from Prometheus and routes to notification channels
# Port: 9093
# Used by: Prometheus sends alerts based on rules
# Config: alertmanager.yml defines routing and receivers
# Health Check: Alertmanager readiness endpoint
# ===========================================================================
test_alertmanager() {
  test_service "alertmanager" \
    "Alert routing and management" \
    "9093" \
    "http://localhost:9093/-/ready"
}

# ===========================================================================
# SERVICE: Data Generator
# Purpose: Generates synthetic data for testing and development
# Port: 9100
# Dependencies: Kafka (sends events), Prometheus (metrics)
# Built from: tools/data-generator/Dockerfile
# Health Check: Port connectivity
# ===========================================================================
test_data_generator() {
  test_service "data-generator" \
    "Synthetic data generation service" \
    "9100" \
    ""
}

# ===========================================================================
# SERVICE: Java Ingest
# Purpose: Java Spring Boot service for data ingestion operations
# Port: 8081 (mapped from internal 8080)
# Dependencies: Kafka, MinIO, Prometheus
# Built from: tools/java-ingest/Dockerfile
# Health Check: Spring Boot Actuator health endpoint
# ===========================================================================
test_java_ingest() {
  test_service "java-ingest" \
    "Java-based data ingestion service" \
    "8081" \
    "http://localhost:8081/actuator/health"
}

# ===========================================================================
# SERVICE: Java Governance
# Purpose: Java Spring Boot service for governance and control operations
# Port: 8082 (mapped from internal 8080)
# Dependencies: Redis (caching and sessions)
# Built from: phase2/java-governance Docker image (canonical)
# Health Check: Spring Boot Actuator health endpoint
# ===========================================================================
test_java_governance() {
  test_service "java-governance" \
    "Java-based governance service with Redis" \
    "8082" \
    "http://localhost:8082/actuator/health"
}

# ===========================================================================
# SERVICE: Nginx Static
# Purpose: Serves static frontend files (HTML, CSS, JS) via Nginx
# Port: 8080
# Serves: Built frontend from dist/apps/frontend
# Health Check: HTTP GET on root path
# ===========================================================================
test_nginx_static() {
  test_service "nginx-static" \
    "Static file web server for frontend" \
    "8080" \
    "http://localhost:8080"
}

# ===========================================================================
# SERVICE: Test Runner
# Purpose: Node.js container for running tests in isolated environment
# Type: One-shot service (restart: no)
# Dependencies: Prometheus
# Built with: Node.js 20 on Debian Bullseye
# Note: Not continuously running, executes tests and exits
# ===========================================================================
test_test_runner() {
  test_start "test-runner service" \
    "Node.js test execution container (one-shot service)"
  
  # test-runner is a one-shot service, just verify it's defined
  if docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | grep -q "^test-runner$"; then
    test_pass "test-runner is defined (one-shot service, not continuously running)"
    return 0
  else
    test_fail "test-runner not defined" "Service not found in compose file"
    return 1
  fi
}

# ============================================================================
# Main Test Runner
# ============================================================================

show_usage() {
  cat <<EOF
Usage: $0 [service-name|all|list|clean]

Test individual Docker Compose services:
  redis              - Redis cache
  zookeeper          - Kafka coordination
  kafka              - Message broker
  rabbitmq           - RabbitMQ message broker
  minio              - S3-compatible storage
  prometheus         - Metrics collection
  grafana            - Dashboards
  loki               - Log aggregation
  alertmanager       - Alert management
  data-generator     - Data generation service
  java-ingest        - Java ingest service
  java-governance    - Java governance service
  nginx-static       - Static web server
  test-runner        - Test execution container

  all                - Run tests for all services in sequence
  list               - Show available services
  clean              - Stop and remove all services

Examples:
  $0 redis           # Test only Redis
  $0 kafka           # Test only Kafka
  $0 java-governance # Test only java-governance
  $0 all             # Test all services
  $0 clean           # Clean up all services

EOF
}

list_services() {
  printf "${BOLD}Available Services:${NC}\n\n"
  printf "${BLUE}Infrastructure Services:${NC}\n"
  printf "  redis              - Redis in-memory data store\n"
  printf "  zookeeper          - Kafka coordination service\n"
  printf "  kafka              - Event streaming message broker\n"
  printf "  rabbitmq           - RabbitMQ message broker\n"
  printf "  minio              - S3-compatible object storage\n"
  printf "\n${BLUE}Monitoring Services:${NC}\n"
  printf "  prometheus         - Metrics collection and monitoring\n"
  printf "  grafana            - Visualization and dashboards\n"
  printf "  loki               - Log aggregation system\n"
  printf "  alertmanager       - Alert routing and management\n"
  printf "\n${BLUE}Application Services:${NC}\n"
  printf "  data-generator     - Synthetic data generation\n"
  printf "  java-ingest        - Java-based data ingestion\n"
  printf "  java-governance    - Java-based governance service\n"
  printf "  nginx-static       - Static file web server\n"
  printf "  test-runner        - Node.js test execution\n"
  printf "\n"
}

clean_services() {
  printf "${YELLOW}Stopping and removing all services...${NC}\n"
  if docker compose -f "$COMPOSE_FILE" down --remove-orphans >> "$TEST_LOG" 2>&1; then
    printf "${GREEN}✓ All services stopped and removed${NC}\n"
  else
    printf "${RED}✗ Failed to clean services${NC}\n"
    exit 1
  fi
}

run_test() {
  case "$1" in
    redis) test_redis ;;
    zookeeper) test_zookeeper ;;
    kafka) test_kafka ;;
    rabbitmq) test_rabbitmq ;;
    minio) test_minio ;;
    prometheus) test_prometheus ;;
    grafana) test_grafana ;;
    loki) test_loki ;;
    alertmanager) test_alertmanager ;;
    data-generator) test_data_generator ;;
    java-ingest) test_java_ingest ;;
    java-governance) test_java_governance ;;
    nginx-static) test_nginx_static ;;
    test-runner) test_test_runner ;;
    *) echo "Unknown service: $1"; return 1 ;;
  esac
}

# Parse arguments
if [ $# -eq 0 ]; then
  show_usage
  exit 0
fi

check_docker
check_compose_file

case "$1" in
  list|--list|-l)
    list_services
    exit 0
    ;;
  help|--help|-h)
    show_usage
    exit 0
    ;;
  clean|cleanup|--clean)
    clean_services
    exit 0
    ;;
  all)
    test_header
    printf "${YELLOW}Note: Testing all services will take several minutes...${NC}\n\n"
    
    # Test in dependency order
    run_test redis || true
    run_test zookeeper || true
    run_test kafka || true
    run_test rabbitmq || true
    run_test minio || true
    run_test prometheus || true
    run_test loki || true
    run_test grafana || true
    run_test alertmanager || true
    run_test data-generator || true
    run_test java-ingest || true
    run_test java-governance || true
    run_test nginx-static || true
    run_test test-runner || true
    ;;
  *)
    test_header
    if run_test "$1"; then
      # Test passed
      printf "\n${GREEN}${BOLD}✓ All checks passed for $1${NC}\n\n"
    else
      # Test failed, show troubleshooting hint
      printf "\n${RED}${BOLD}✗ Test failed for $1${NC}\n\n"
      printf "${BOLD}${YELLOW}Troubleshooting tips:${NC}\n"
      printf "  ${CYAN}→${NC} Check logs: ${DIM}docker compose -f docker/dev-compose.yml logs $1${NC}\n"
      printf "  ${CYAN}→${NC} View status: ${DIM}docker compose -f docker/dev-compose.yml ps $1${NC}\n"
      printf "  ${CYAN}→${NC} Restart service: ${DIM}docker compose -f docker/dev-compose.yml restart $1${NC}\n"
      printf "  ${CYAN}→${NC} Full test log: ${DIM}%s${NC}\n\n" "$TEST_LOG"
    fi
    ;;
esac

# Print summary
if [ "$1" = "all" ] || [ "$TESTS_RUN" -gt 1 ]; then
  printf "\n${BOLD}${CYAN}"
  printf "╔═══════════════════════════════════════════════════════════════════╗\n"
  printf "║                         Test Summary                              ║\n"
  printf "╚═══════════════════════════════════════════════════════════════════╝\n"
  printf "${NC}\n"

  if [ "$TESTS_PASSED" -gt 0 ]; then
    printf "${GREEN}${BOLD}✓ Passed:  ${NC}${GREEN}%d service(s)${NC}\n" "$TESTS_PASSED"
  fi
  if [ "$TESTS_FAILED" -gt 0 ]; then
    printf "${RED}${BOLD}✗ Failed:  ${NC}${RED}%d service(s)${NC}\n" "$TESTS_FAILED"
  fi
  printf "${DIM}Total:     %d service(s) tested${NC}\n\n" "$TESTS_RUN"

  printf "${DIM}Full logs: %s${NC}\n" "$TEST_LOG"
  printf "${DIM}Service logs: docker compose -f docker/dev-compose.yml logs -f${NC}\n\n"
fi

if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
else
  exit 0
fi

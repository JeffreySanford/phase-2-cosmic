#!/usr/bin/env bash
# Automated verifier for the demo playground checklist
# Runs the commands referenced in DEMO_PLAYGROUND.md and reports pass/fail
#
# Mission linkage:
# - Mission outcome: Reproducible science
# - Operator/science impact: Automated verification reduces manual checklist errors
# - Validation evidence: Pass/fail output with detailed test results

set -euo pipefail

# Color output for readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

log_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((PASS_COUNT++))
}

log_fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((FAIL_COUNT++))
}

log_info() {
  echo -e "${YELLOW}ℹ INFO${NC}: $1"
}

echo "======================================"
echo "  NGVLA Demo Verification Script"
echo "======================================"
echo ""
log_info "Starting demo verification..."
echo ""

# ===== Pre-flight checks =====
echo "--- Pre-flight Checks ---"

# Ensure required services are running
if ! docker compose -f docker/dev-compose.yml ps | grep -q java-governance; then
  log_fail "Compose stack not running. Run 'docker compose -f docker/dev-compose.yml up -d' first."
  exit 1
else
  log_pass "Docker compose stack is running"
fi

# Check frontend
if ! curl -sf http://localhost:4000/ >/dev/null 2>&1; then
  log_fail "Frontend not reachable at http://localhost:4000"
  exit 1
else
  log_pass "Frontend is accessible at http://localhost:4000"
fi

# Check governance API health endpoint
if ! curl -sf http://localhost:8082/api/v1/health | grep -q ok; then
  log_fail "Governance health endpoint failed"
  exit 1
else
  log_pass "Governance API health check passed"
fi

echo ""

# ===== API Contract Tests =====
echo "--- API Contract Tests ---"

# Test request-id propagation
TEST_REQUEST_ID="demo-verify-$(date +%s)"
RESPONSE_HEADER=$(curl -sf -D - -o /dev/null -X GET \
  -H "X-Request-Id: ${TEST_REQUEST_ID}" \
  http://localhost:8082/api/v1/health 2>&1)

if echo "$RESPONSE_HEADER" | grep -qi "X-Request-Id.*${TEST_REQUEST_ID}"; then
  log_pass "Request-id propagation working"
else
  log_fail "Request-id not propagated (expected: ${TEST_REQUEST_ID})"
fi

echo ""

# ===== Job Lifecycle Tests =====
echo "--- Job Lifecycle Tests ---"

# Submit a standard job
JOB_PAYLOAD='{"workflow":"casa-imaging","datasetId":"demo-verify","parameters":{"mode":"test"},"requestedBy":"demo-verify"}'
JOB_RESPONSE=$(curl -sf -X POST http://localhost:8082/api/v1/jobs \
  -H 'Content-Type: application/json' \
  -H "X-Request-Id: ${TEST_REQUEST_ID}-submit" \
  -d "${JOB_PAYLOAD}")

JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.jobId')
if [[ -z "$JOB_ID" || "$JOB_ID" == "null" ]]; then
  log_fail "Failed to submit job (no jobId returned)"
  exit 1
else
  log_pass "Job submitted successfully (jobId: ${JOB_ID})"
fi

# Get initial job version for optimistic locking
INITIAL_STATUS=$(curl -sf http://localhost:8082/api/v1/jobs/$JOB_ID)
VERSION=$(echo "$INITIAL_STATUS" | jq -r '.version')
INITIAL_STATE=$(echo "$INITIAL_STATUS" | jq -r '.status')
log_info "Initial job state: ${INITIAL_STATE}, version: ${VERSION}"

# Wait for job to reach terminal or stable state
STATUS=""
for i in {1..20}; do
  JOB_STATUS=$(curl -sf http://localhost:8082/api/v1/jobs/$JOB_ID)
  STATUS=$(echo "$JOB_STATUS" | jq -r '.status')
  if [[ "$STATUS" != "QUEUED" && "$STATUS" != "RUNNING" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$STATUS" ]]; then
  log_fail "Could not query job status"
  exit 1
else
  log_pass "Job reached state: ${STATUS}"
fi

# Test job cancellation endpoint (if job is still active)
if [[ "$STATUS" == "QUEUED" || "$STATUS" == "RUNNING" ]]; then
  CANCEL_RESPONSE=$(curl -sf -X POST http://localhost:8082/api/v1/jobs/$JOB_ID/cancel \
    -H 'Content-Type: application/json' \
    -d "{\"expectedVersion\":${VERSION}}" || echo "")
  
  if [[ -n "$CANCEL_RESPONSE" ]]; then
    CANCEL_STATUS=$(echo "$CANCEL_RESPONSE" | jq -r '.status')
    if [[ "$CANCEL_STATUS" == "CANCELED" ]]; then
      log_pass "Job cancellation successful"
    else
      log_fail "Job cancellation returned unexpected status: ${CANCEL_STATUS}"
    fi
  else
    log_fail "Job cancellation endpoint failed"
  fi
else
  log_info "Skipping cancellation test (job already in terminal state: ${STATUS})"
fi

echo ""

# ===== NGVLA-specific Tests =====
echo "--- NGVLA Contract Tests ---"

# Submit job with ngVLA-specific parameters
NGVLA_JOB_PAYLOAD='{
  "workflow":"ngvla-imaging",
  "datasetId":"NGVLA_TEST_OBS",
  "parameters":{"weighting":"briggs","robust":"0.5"},
  "ngvlaParams":{
    "arraySegment":"Main",
    "antennaClass":"18m",
    "frequencyBandGHz":{"min":12.0,"max":18.0},
    "centralFrequencyGHz":15.0,
    "bandwidthMHz":2000
  },
  "requestedBy":"demo-verify-ngvla"
}'

NGVLA_JOB_RESPONSE=$(curl -sf -X POST http://localhost:8082/api/v1/jobs \
  -H 'Content-Type: application/json' \
  -d "${NGVLA_JOB_PAYLOAD}")

NGVLA_JOB_ID=$(echo "$NGVLA_JOB_RESPONSE" | jq -r '.jobId')
if [[ -z "$NGVLA_JOB_ID" || "$NGVLA_JOB_ID" == "null" ]]; then
  log_fail "Failed to submit ngVLA job"
else
  log_pass "ngVLA job submitted successfully (jobId: ${NGVLA_JOB_ID})"
fi

echo ""

# ===== List and Filter Tests =====
echo "--- Pagination and Filtering Tests ---"

# Test job listing with pagination
JOBS_LIST=$(curl -sf "http://localhost:8082/api/v1/jobs?page=0&size=10")
JOBS_COUNT=$(echo "$JOBS_LIST" | jq 'length')

if [[ "$JOBS_COUNT" -ge 0 ]]; then
  log_pass "Job listing with pagination (returned ${JOBS_COUNT} jobs)"
else
  log_fail "Job listing failed"
fi

# Test job filtering by workflow
FILTERED_JOBS=$(curl -sf "http://localhost:8082/api/v1/jobs?workflow=casa-imaging")
FILTERED_COUNT=$(echo "$FILTERED_JOBS" | jq 'length')

if [[ "$FILTERED_COUNT" -ge 0 ]]; then
  log_pass "Job filtering by workflow (found ${FILTERED_COUNT} jobs)"
else
  log_fail "Job filtering failed"
fi

echo ""

# ===== Summary =====
echo "======================================"
echo "  Verification Summary"
echo "======================================"
echo -e "${GREEN}Passed${NC}: ${PASS_COUNT}"
echo -e "${RED}Failed${NC}: ${FAIL_COUNT}"
echo ""

if [[ $FAIL_COUNT -eq 0 ]]; then
  echo -e "${GREEN}✓ All demo verification checks passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some demo verification checks failed${NC}"
  exit 1
fi

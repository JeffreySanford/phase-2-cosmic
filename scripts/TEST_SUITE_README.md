# Start-All-Reset Test Suite

This directory contains a comprehensive test suite for diagnosing failures in the `start:all:reset` process.

## Overview

The `start:all:reset` script performs 8 critical steps to set up the development environment:

1. **Stop Local Services** - Stops any running local development services
2. **Load Environment Configuration** - Loads `.env` or `.env.sample`
3. **Docker Registry Login** - Authenticates with Docker Hub (optional)
4. **Clean Docker Environment** - Removes all containers, images, and volumes
5. **Prepare Test Environment (Redis)** - Starts Redis container for tests
6. **Run Java Tests** - Executes Maven tests for Java modules
7. **Build & Start Services** - Builds images and starts all services
8. **Post-Start Verification** - Performs health checks on services

## Test Script

The test script `test-start-all-reset.sh` allows you to:

- Test individual steps in isolation
- Run all tests in sequence
- Diagnose which step is failing
- View detailed logs for each test

## Usage

### Make the test script executable (first time only)

```bash
chmod +x scripts/test-start-all-reset.sh
```

### Test a specific step

```bash
# Test step 1 (Stop Local Services)
./scripts/test-start-all-reset.sh 1

# Test step 5 (Prepare Redis)
./scripts/test-start-all-reset.sh 5

# Test step 6 (Java Tests)
./scripts/test-start-all-reset.sh 6
```

### Run all tests

```bash
./scripts/test-start-all-reset.sh all
```

### List available tests

```bash
./scripts/test-start-all-reset.sh list
```

### Show help

```bash
./scripts/test-start-all-reset.sh help
```

## Test Descriptions

### Test 1: Stop Local Services

**Purpose:** Verifies that `stop-local-services.js` can execute and stop running services

**What it checks:**

- Node.js is available
- `stop-local-services.js` script exists
- Script executes without errors

**When to run:** If services aren't stopping properly or ports remain occupied

### Test 2: Load Environment Configuration

**Purpose:** Verifies environment files exist and can be loaded

**What it checks:**

- `.env` or `.env.sample` exists
- File can be sourced without syntax errors
- Environment variables are loaded

**When to run:** If you get errors about missing environment variables

### Test 3: Docker Registry Login

**Purpose:** Verifies Docker login works if credentials are provided

**What it checks:**

- Docker is available
- `DOCKER_PAT` is set (optional)
- Docker login succeeds with provided credentials

**When to run:** If you hit Docker Hub rate limits or login failures

### Test 4: Clean Docker Environment

**Purpose:** Verifies docker-compose can clean up the dev environment

**What it checks:**

- Docker daemon is running
- `dev-compose.yml` exists
- Docker cleanup command succeeds

**When to run:** If you have issues with stale containers or images

### Test 5: Prepare Test Environment (Redis)

**Purpose:** Verifies Redis container can be started and is accessible

**What it checks:**

- Docker is available
- Redis container starts (via compose or standalone)
- Redis responds to PING within 30 seconds

**When to run:** If Java tests fail with Redis connection errors

### Test 6: Run Java Tests

**Purpose:** Verifies Java tests can run successfully with Maven

**What it checks:**

- Java/Maven is available (local or Docker)
- Tests execute without compilation errors
- Tests pass for both modules:
  - `apps/java-governance` - Governance service tests
  - `tools/java-ingest` - Ingest tool tests

**When to run:** If you get test failures or compilation errors

### Test 7: Build & Start Services

**Purpose:** Verifies docker-compose can build and start all services

**What it checks:**

- Docker daemon is running
- `dev-compose.yml` is valid YAML
- Compose config is valid

**When to run:** If services fail to start or you get compose errors

### Test 8: Post-Start Verification

**Purpose:** Verifies services can respond to health checks

**What it checks:**

- Services are running
- Containers are in healthy state
- Health endpoints are accessible

**When to run:** If services start but don't respond to requests

## Maintenance

When modifying `start-all-reset.sh`, ensure:

1. **Each step has a description block** with:
   - Clear description of what the step does
   - Reference to the corresponding test command

2. **Corresponding test exists** in `test-start-all-reset.sh` with:
   - `test_step_XX_name()` function
   - Detailed description of what it verifies
   - Proper error messages for failures

3. **Update this README** if you add, remove, or modify steps

## Troubleshooting Workflow

When `start:all:reset` fails:

1. **Identify the failing step** from the console output
2. **Run the specific test** for that step: `./scripts/test-start-all-reset.sh N`
3. **Read the test log** at `logs/test-start-all-reset-TIMESTAMP.log`
4. **Fix the issue** based on the test output
5. **Re-run the test** to verify the fix
6. **Run the full reset** once the test passes

## Example Troubleshooting Session

```bash
# Start-all-reset fails at Redis step
pnpm run start:all:reset
# Output: ✗ Failed to start Redis

# Test the Redis step in isolation
./scripts/test-start-all-reset.sh 5
# Output: ✗ FAIL: Redis did not become ready within 30 seconds

# Check Docker status
docker ps

# Check Redis logs
docker logs phase2-cosmic-redis

# Fix the issue (e.g., port conflict, memory issue)

# Re-test
./scripts/test-start-all-reset.sh 5
# Output: ✓ PASS: Redis is ready and responding to PING

# Now run full reset
pnpm run start:all:reset
```

## Logs

All test outputs are logged to:

- **Console:** Color-coded summary with pass/fail indicators
- **File:** `logs/test-start-all-reset-TIMESTAMP.log` (verbose output)

Keep these logs when reporting issues or debugging problems.

## CI/CD Integration

These tests can be integrated into CI pipelines:

```yaml
# Example GitHub Actions workflow
- name: Test environment setup steps
  run: |
    chmod +x scripts/test-start-all-reset.sh
    ./scripts/test-start-all-reset.sh all
```

Exit codes:

- `0` - All tests passed
- `1` - One or more tests failed

## Related Files

- `scripts/start-all-reset.sh` - Main script being tested
- `scripts/test-start-all-reset.sh` - Test runner
- `scripts/stop-local-services.js` - Service cleanup script
- `docker/dev-compose.yml` - Docker Compose configuration

# Service Testing Guide

Test individual Docker Compose services to diagnose startup and health check failures.

## Overview

The `test-services.sh` script allows you to test each of the 14 Docker Compose services independently, helping you quickly identify which service is causing failures in `start:all:reset`.

## Available Services

### Infrastructure Services

- **redis** - In-memory data store for caching (Port: 6379)
- **zookeeper** - Kafka coordination service (Port: 2181)
- **kafka** - Event streaming message broker (Port: 9092)
- **rabbitmq** - RabbitMQ message broker (Ports: 5672, 15672)
- **minio** - S3-compatible object storage (Port: 9000)

### Monitoring Services

- **prometheus** - Metrics collection (Port: 9090)
- **grafana** - Dashboards and visualization (Port: 3000)
- **loki** - Log aggregation (Port: 3100)
- **alertmanager** - Alert routing (Port: 9093)

### Application Services

- **data-generator** - Synthetic data generation (Port: 9100)
- **java-ingest** - Data ingestion service (Port: 8081)
- **java-governance** - Governance service (Port: 8082)
- **nginx-static** - Static web server (Port: 8080)
- **test-runner** - Test execution container

## Usage

### Make executable (first time only)

```bash
chmod +x scripts/test-services.sh
```

### Test a single service

```bash
# Test Redis
./scripts/test-services.sh redis

# Test Kafka
./scripts/test-services.sh kafka

# Test Java governance service
./scripts/test-services.sh java-governance
```

### List all services

```bash
./scripts/test-services.sh list
```

### Test all services

```bash
./scripts/test-services.sh all
```

### Clean up all services

```bash
./scripts/test-services.sh clean
```

## Output Format

Each test provides color-coded, step-by-step feedback:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▸ Test 1: redis service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Description: In-memory data store for caching and session management
  → Checking service definition...
  → Service definition found
  → Starting service with dependencies...
  → Service started successfully
  → Verifying container status...
  → Container is running
  → Testing port connectivity: 6379
  → Port is accessible
✓ SUCCESS: redis is running and port 6379 is accessible
  → Running Redis-specific validation...
  → Testing Redis PING command...
  → Redis PING successful

✓ All checks passed for redis
```

### Color Legend

- **Green (✓)** - Success, service is working correctly
- **Yellow (⚠)** - Warning, service has minor issues but may be functional
- **Red (✗)** - Failure, service has critical issues

## Service Details

### Redis

**Purpose:** In-memory data store for caching and session management  
**Used by:** java-governance (session cache)  
**Health Check:** Redis PING command  
**Common Issues:**

- Port 6379 already in use
- Insufficient memory

### Zookeeper

**Purpose:** Distributed coordination service required by Kafka  
**Used by:** Kafka cluster coordination  
**Port:** 2181  
**Common Issues:**

- Port conflict
- Data directory permissions

### Kafka

**Purpose:** Distributed event streaming platform  
**Depends on:** Zookeeper  
**Port:** 9092  
**Health Check:** kafka-broker-api-versions command  
**Common Issues:**

- Zookeeper not ready
- Port 9092 in use
- Broker ID conflicts

### RabbitMQ

**Purpose:** AMQP message broker with management UI  
**Ports:** 5672 (AMQP), 15672 (Management)  
**Health Check:** rabbitmq-diagnostics status, HTTP API  
**Common Issues:**

- Port conflicts
- Cookie/cluster issues

### MinIO

**Purpose:** S3-compatible object storage  
**Used by:** java-ingest for file storage  
**Port:** 9000  
**Credentials:** minio/minio123  
**Health Check:** /minio/health/live endpoint  
**Common Issues:**

- Port 9000 in use
- Volume mount issues

### Prometheus

**Purpose:** Time-series metrics collection  
**Port:** 9090  
**Config:** prometheus.yml (scrape targets)  
**Health Check:** /-/ready endpoint  
**Common Issues:**

- Config file syntax errors
- Can't reach scrape targets

### Grafana

**Purpose:** Visualization and dashboards  
**Depends on:** Prometheus, Loki  
**Port:** 3000  
**Credentials:** admin/admin  
**Health Check:** /api/health endpoint  
**Common Issues:**

- Database initialization fails
- Datasource connection issues

### Loki

**Purpose:** Log aggregation (Prometheus for logs)  
**Port:** 3100  
**Config:** loki-config.yml  
**Health Check:** /ready endpoint  
**Common Issues:**

- Config file errors
- Storage issues

### Alertmanager

**Purpose:** Alert routing from Prometheus  
**Port:** 9093  
**Config:** alertmanager.yml  
**Health Check:** /-/ready endpoint

### Data Generator

**Purpose:** Generates synthetic data for testing  
**Depends on:** Kafka, Prometheus  
**Port:** 9100  
**Built from:** tools/data-generator/Dockerfile  
**Common Issues:**

- Build failures
- Kafka connection issues

### Java Ingest

**Purpose:** Java Spring Boot data ingestion service  
**Depends on:** Kafka, MinIO, Prometheus  
**Port:** 8081 (internal 8080)  
**Built from:** tools/java-ingest/Dockerfile  
**Health Check:** /actuator/health endpoint  
**Common Issues:**

- Build failures (Maven dependencies)
- Service startup timeout
- Connection to Kafka/MinIO fails

### Java Governance

**Purpose:** Java Spring Boot governance service  
**Depends on:** Redis  
**Port:** 8082 (internal 8080)  
**Built from:** apps/java-governance/Dockerfile  
**Health Check:** /actuator/health endpoint  
**Common Issues:**

- Build failures (Maven dependencies)
- Redis connection fails
- Health check timeout

### Nginx Static

**Purpose:** Serves frontend static files  
**Port:** 8080  
**Serves from:** dist/apps/frontend  
**Health Check:** HTTP GET /  
**Common Issues:**

- Frontend build not completed
- Port 8080 in use

### Test Runner

**Purpose:** Node.js test execution container  
**Type:** One-shot service (not continuously running)  
**Depends on:** Prometheus  
**Note:** This service runs tests and exits, it's not a long-running service

## Troubleshooting Workflow

When a service test fails:

1. **Run the individual test:**

   ```bash
   ./scripts/test-services.sh <service-name>
   ```

2. **Check the test output** for specific failure reasons

3. **View service logs:**

   ```bash
   docker compose -f docker/dev-compose.yml logs <service-name>
   ```

4. **Check container status:**

   ```bash
   docker compose -f docker/dev-compose.yml ps <service-name>
   ```

5. **Restart the service:**

   ```bash
   docker compose -f docker/dev-compose.yml restart <service-name>
   ```

6. **Clean and retry:**

   ```bash
   ./scripts/test-services.sh clean
   ./scripts/test-services.sh <service-name>
   ```

## Example Troubleshooting Session

```bash
# Test failed at "Build & Start Services"
pnpm run start:all:reset
# Output: ✗ Failed to start services

# Test individual services to find the culprit
./scripts/test-services.sh java-governance
# Output: ✗ FAILED: Health check failed after 30 attempts

# Check logs
docker compose -f docker/dev-compose.yml logs java-governance
# Finds: "Cannot connect to Redis"

# Test Redis
./scripts/test-services.sh redis
# Output: ✓ SUCCESS: redis is running

# Restart java-governance now that dependencies are up
docker compose -f docker/dev-compose.yml restart java-governance

# Verify fix
./scripts/test-services.sh java-governance
# Output: ✓ SUCCESS: java-governance is running and healthy
```

## Integration with CI/CD

These tests can be used in CI pipelines:

```yaml
# Example GitHub Actions
- name: Test individual services
  run: |
    chmod +x scripts/test-services.sh
    ./scripts/test-services.sh all
```

Exit codes:

- `0` - All tested services passed
- `1` - One or more services failed

## Logs

All test outputs are logged to:

- **Console:** Color-coded progress with step-by-step feedback
- **File:** `logs/test-services-TIMESTAMP.log` (verbose output)

## Related Files

- `scripts/test-services.sh` - Service test script
- `docker/dev-compose.yml` - Docker Compose configuration
- `scripts/test-start-all-reset.sh` - Process step tests
- `scripts/start-all-reset.sh` - Main startup script

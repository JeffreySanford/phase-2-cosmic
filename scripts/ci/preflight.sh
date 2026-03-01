#!/usr/bin/env bash
set -euo pipefail

# CI preflight: start a local Redis container (ephemeral) and wait until it's reachable.
# This helps catch missing services/env misconfigurations early in the pipeline.

echo "CI preflight: ensuring Docker is available..."
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not in PATH. Failing preflight." >&2
  exit 1
fi

CONTAINER_NAME=ci-redis
IMAGE=redis:7-alpine

if docker ps --filter "name=$CONTAINER_NAME" --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  echo "Found existing $CONTAINER_NAME container; skipping start."
else
  echo "Starting Redis container ($IMAGE)"
  docker run --rm -d --name "$CONTAINER_NAME" -p 6379:6379 "$IMAGE"
fi

echo "Waiting for Redis to accept connections on localhost:6379"
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if nc -z localhost 6379 >/dev/null 2>&1; then
    echo "Redis is reachable."
    break
  fi
  echo "  waiting ($i/$RETRIES)..."
  sleep 1
  if [ "$i" -eq "$RETRIES" ]; then
    echo "Redis did not become reachable in time." >&2
    docker logs "$CONTAINER_NAME" || true
    docker stop "$CONTAINER_NAME" || true
    exit 2
  fi
done

echo "Preflight OK: Redis available. Proceeding to tests."

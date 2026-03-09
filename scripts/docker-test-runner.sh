#!/usr/bin/env bash
set -euo pipefail
echo "Starting docker test-runner..."

# Ensure pnpm is available
corepack enable || true
corepack prepare pnpm@latest --activate || true

export PNPM_STORE_DIR=/pnpm-store
mkdir -p "$PNPM_STORE_DIR"

echo "Installing dependencies (using pnpm store at $PNPM_STORE_DIR)"
pnpm install --frozen-lockfile --store-dir="$PNPM_STORE_DIR" --ignore-scripts

# Try to run affected tests against origin/main if available, otherwise run all tests
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "Running affected tests against origin/main"
  pnpm nx affected --target=test --base=origin/main --parallel=false || pnpm nx run-many --target=test --all --parallel=false
else
  echo "origin/main not found; running all tests"
  pnpm nx run-many --target=test --all --parallel=false
fi

echo "Running Java tests (governance + ingest) with container integration..."
mvn -f apps/java-governance/pom.xml clean verify -Pwith-containers -B
mvn -f tools/java-ingest/pom.xml clean verify -Pwith-containers -B

echo "Running Go unit tests (data-generator)..."
sh ./scripts/test-go.sh

echo "Test-runner finished."

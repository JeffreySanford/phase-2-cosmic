#!/usr/bin/env bash
set -euo pipefail
echo "Step 1 of 6: Starting docker test-runner..."

# Ensure pnpm is available
corepack enable || true
corepack prepare pnpm@latest --activate || true

# use a repo-local directory for pnpm store to avoid permission issues on Windows
export PNPM_STORE_DIR=$(pwd)/docker-store
mkdir -p "$PNPM_STORE_DIR"

echo "Step 2 of 6: Installing dependencies (using pnpm store at $PNPM_STORE_DIR)"
pnpm install --frozen-lockfile --store-dir="$PNPM_STORE_DIR" --ignore-scripts

# Try to run affected tests against origin/main if available, otherwise run all tests
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "Step 3 of 6: Running affected tests against origin/main"
  pnpm nx affected --target=test --base=origin/main --parallel=false || pnpm nx run-many --target=test --all --parallel=false
else
  echo "Step 3 of 6: origin/main not found; running all tests"
  pnpm nx run-many --target=test --all --parallel=false
fi

echo "Step 4 of 6: Running Java tests (governance + ingest) with container integration..."
mvn -f apps/java-governance/pom.xml clean verify -Pwith-containers -B
mvn -f tools/java-ingest/pom.xml clean verify -Pwith-containers -B

echo "Step 5 of 6: Running Go unit tests (data-generator)..."
sh ./scripts/test-go.sh

echo "Step 6 of 6: Test-runner finished."

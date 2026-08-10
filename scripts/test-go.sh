#!/usr/bin/env bash
# Run Go unit tests for all Go modules in the repository.
# Safe to skip with a warning if the 'go' binary is not installed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v go &>/dev/null; then
  echo "WARNING: 'go' not found on PATH — skipping Go tests."
  echo "Install Go from https://go.dev/dl/ to enable Go module tests."
  exit 0
fi

# Every Go module in the workspace. Add new modules here so they cannot be
# silently left out of the gate.
GO_MODULES=(
  "tools/data-generator"
  "tools/pulsar-collector"
  "apps/cosmic-forge-fits-renderer-go"
)

for module in "${GO_MODULES[@]}"; do
  echo "=== Running Go unit tests: ${module} ==="
  (cd "$REPO_ROOT/$module" && go test ./... -v -count=1)
  echo ""
done

echo "=== Running Go static analysis (go vet) ==="
for module in "${GO_MODULES[@]}"; do
  echo "--- go vet: ${module} ---"
  (cd "$REPO_ROOT/$module" && go vet ./...)
done

echo ""
echo "=== All Go tests passed ==="

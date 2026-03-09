#!/usr/bin/env bash
# Run Go unit tests for all Go modules in the repository.
# Safe to skip with a warning if the 'go' binary is not installed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v go &>/dev/null; then
  echo "WARNING: 'go' not found on PATH — skipping Go tests."
  echo "Install Go from https://go.dev/dl/ to enable data-generator tests."
  exit 0
fi

echo "=== Running Go unit tests: tools/data-generator ==="
cd "$REPO_ROOT/tools/data-generator"
go test ./... -v -count=1

echo ""
echo "=== All Go tests passed ==="

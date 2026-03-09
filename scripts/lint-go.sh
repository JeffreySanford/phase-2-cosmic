#!/usr/bin/env bash
# lint-go.sh — Run golangci-lint across all Go services.
# Gracefully skips if golangci-lint is not installed.
#
# Install golangci-lint:  https://golangci-lint.run/usage/install/
#   macOS:   brew install golangci-lint
#   Linux:   curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin
#   Windows: winget install golangci-lint  OR  choco install golangci-lint
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v golangci-lint >/dev/null 2>&1; then
  echo "WARNING: golangci-lint not found — skipping Go static analysis"
  echo "  Install from https://golangci-lint.run/usage/install/ to enable locally."
  exit 0
fi

echo "==> Running golangci-lint in tools/data-generator..."
cd "${REPO_ROOT}/tools/data-generator"
golangci-lint run ./...
echo "==> golangci-lint: OK"

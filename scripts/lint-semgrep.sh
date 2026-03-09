#!/usr/bin/env bash
# lint-semgrep.sh — Run Semgrep SAST across all languages in the repo.
# Semgrep is a free, open-source multi-language static analysis tool.
# It scans TypeScript, Java, Go, and Python without any account or API key
# when using the bundled OSS rulesets.
#
# Gracefully skips if semgrep is not installed.
#
# Install semgrep:
#   pip install semgrep              (all platforms via PyPI)
#   brew install semgrep             (macOS)
#   docker run --rm -v "$PWD:/src" semgrep/semgrep scan ...  (Docker)
#
# Docs: https://semgrep.dev/docs/getting-started/quickstart
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v semgrep >/dev/null 2>&1; then
  echo "WARNING: semgrep not found — skipping multi-language SAST"
  echo "  Install with: pip install semgrep"
  exit 0
fi

echo "==> Running Semgrep SAST (java, go, python, javascript rulesets)..."
cd "${REPO_ROOT}"

# Use the free registry rulesets (no account required).
# r/<lang> pulls the full open-source ruleset for each language.
# --severity=ERROR: only exit non-zero on high-severity security findings.
# --exclude skips generated, vendor, and build output directories.
semgrep scan \
  --config "r/java" \
  --config "r/go" \
  --config "r/python" \
  --config "r/javascript" \
  --severity ERROR \
  --error \
  --exclude "node_modules" \
  --exclude "pnpm-store" \
  --exclude "target" \
  --exclude "dist" \
  --exclude ".nx" \
  --exclude "coverage" \
  --jobs 4 \
  .

echo "==> Semgrep: OK"

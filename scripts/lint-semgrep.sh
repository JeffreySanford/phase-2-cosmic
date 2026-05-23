#!/usr/bin/env bash
# lint-semgrep.sh — Run Semgrep SAST across all languages in the repo.
# Semgrep is a free, open-source multi-language static analysis tool.
# It scans TypeScript, Java, Go, and Python without any account or API key
# when using the bundled OSS rulesets.
#
# Runs Semgrep from Docker by default so Windows hosts do not need a local
# Python/Semgrep install.
#
# Optional local override:
#   SEMGREP_USE_LOCAL=1 sh ./scripts/lint-semgrep.sh
#
# Docs: https://semgrep.dev/docs/getting-started/quickstart
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEMGREP_IMAGE="${SEMGREP_IMAGE:-semgrep/semgrep:latest}"

SEMGREP_ARGS=(
  scan
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
  --exclude "coverage-report" \
  --exclude "gh-artifacts" \
  --exclude ".nx" \
  --exclude "coverage" \
  --jobs 4 \
  .
)

echo "==> Running Semgrep SAST in Docker (java, go, python, javascript rulesets)..."
cd "${REPO_ROOT}"

# Use the free registry rulesets (no account required).
# r/<lang> pulls the full open-source ruleset for each language.
# --severity=ERROR: only exits non-zero on high-severity security findings.
# --exclude skips generated, vendor, and build output directories.
if [[ "${SEMGREP_USE_LOCAL:-0}" == "1" ]]; then
  if ! command -v semgrep >/dev/null 2>&1; then
    echo "ERROR: SEMGREP_USE_LOCAL=1 was set, but semgrep is not installed." >&2
    exit 1
  fi

  semgrep "${SEMGREP_ARGS[@]}"
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Docker is required for Semgrep SAST." >&2
    echo "  Install/start Docker, or set SEMGREP_USE_LOCAL=1 to use a local semgrep binary." >&2
    exit 1
  fi

  HOST_REPO="${REPO_ROOT}"
  if command -v cygpath >/dev/null 2>&1; then
    HOST_REPO="$(cygpath -w "${REPO_ROOT}")"
  fi

  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "${HOST_REPO}:/src" \
    -w /src \
    "${SEMGREP_IMAGE}" \
    semgrep "${SEMGREP_ARGS[@]}"
fi

echo "==> Semgrep: OK"

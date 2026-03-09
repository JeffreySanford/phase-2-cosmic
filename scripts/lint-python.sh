#!/usr/bin/env bash
# lint-python.sh — Run ruff + mypy across Python source files in the repo.
# Gracefully skips if no Python files exist or if the tools are not installed.
#
# Install tools:   pip install ruff mypy
# Documentation:
#   ruff:  https://docs.astral.sh/ruff/
#   mypy:  https://mypy.readthedocs.io/
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

# Discover Python files outside of generated/vendor directories
PYTHON_FILES=$(find . \
  -name "*.py" \
  -not -path "*/node_modules/*" \
  -not -path "*/.venv/*" \
  -not -path "*/pnpm-store/*" \
  -not -path "*/target/*" \
  -not -path "*/__pycache__/*" \
  2>/dev/null | head -1)

if [ -z "${PYTHON_FILES}" ]; then
  echo "No Python files found in workspace — skipping Python lint."
  exit 0
fi

MISSING=""
command -v ruff >/dev/null 2>&1 || MISSING="${MISSING} ruff"
command -v mypy >/dev/null 2>&1 || MISSING="${MISSING} mypy"

if [ -n "${MISSING}" ]; then
  echo "WARNING: Python lint tools not found (${MISSING}) — skipping."
  echo "  Install with: pip install ruff mypy"
  exit 0
fi

echo "==> Running ruff (lint + format check)..."
ruff check .
ruff format --check .
echo "==> Running mypy (strict type checking)..."
mypy --strict .
echo "==> Python lint: OK"

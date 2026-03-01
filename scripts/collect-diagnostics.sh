#!/usr/bin/env bash
# Bash diagnostic collector for phase-2-cosmic
# Usage: bash scripts/collect-diagnostics.sh

set -euo pipefail

# Remove previous diagnostics bundle to avoid recursive nesting and stale captures.
previous_diag=$(find logs -maxdepth 1 -type d -name 'diagnostics-*' 2>/dev/null | sort | tail -n1 || true)
if [ -n "${previous_diag:-}" ]; then
  echo "Removing previous diagnostics bundle: $previous_diag"
  rm -rf "$previous_diag"
fi

timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
outdir="logs/diagnostics-$timestamp"
mkdir -p "$outdir"
echo "Collecting diagnostics into: $outdir"

# 1) copy existing repo log files (top-level only) if present
if [ -d logs ]; then
  echo "Copying repo logs..."
  mkdir -p "$outdir/repo-logs"
  find logs -maxdepth 1 -type f -exec cp {} "$outdir/repo-logs/" \; 2>/dev/null || true
fi

# 2) copy Cypress screenshots (if present)
if [ -d dist/cypress/apps/frontend-e2e/screenshots ]; then
  echo "Copying Cypress screenshots..."
  mkdir -p "$outdir/screenshots"
  shopt -s globstar || true
  cp -v dist/cypress/apps/frontend-e2e/screenshots/**/*.png "$outdir/screenshots" 2>/dev/null || true
fi

# 3) collect docker compose logs for java-governance (if docker available)
if command -v docker >/dev/null 2>&1; then
  echo "Collecting docker compose logs for java-governance"
  docker compose -f docker/dev-compose.yml logs --no-color --timestamps java-governance > "$outdir/java-governance.log" 2>&1 || true
fi

# 4) snapshot listeners on ports 4200, 4000, and 3000
if command -v ss >/dev/null 2>&1; then
  ss -ltnp | grep -E ':4200|:4000|:3000' > "$outdir/ports-ss.txt" 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -i :4200 -sTCP:LISTEN -Pn > "$outdir/ports-lsof-4200.txt" 2>/dev/null || true
  lsof -i :4000 -sTCP:LISTEN -Pn > "$outdir/ports-lsof-4000.txt" 2>/dev/null || true
  lsof -i :3000 -sTCP:LISTEN -Pn > "$outdir/ports-lsof-3000.txt" 2>/dev/null || true
else
  netstat -aon | grep -E ':4200|:4000|:3000' > "$outdir/ports-netstat.txt" 2>/dev/null || true
fi

# 5) tail the most recently modified start* log under logs/
if [ -d logs ]; then
  latest=$(find logs -maxdepth 1 -type f -name 'start*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)
  if [ -n "$latest" ]; then
    echo "Tailing start log: $latest"
    tail -n 2000 "$latest" > "$outdir/start-latest.log" 2>/dev/null || true
  else
    echo "No start* logs found under logs/"
  fi
fi

echo "Diagnostics collected into: $outdir"
echo "You can compress the folder or attach files from there."

#!/usr/bin/env bash
# Validate that canonical planning documents include required mission linkage fields

set -euo pipefail

docs=(TODO.md ROADMAP.md)
missing=0
for f in "${docs[@]}"; do
  if [[ -f $f ]]; then
    if ! grep -qE 'Mission outcome:|Mission linkage:' "$f"; then
      echo "[ERROR] $f lacks mission linkage anchors"
      missing=1
    fi
  fi
done

# ensure MVP and demo documents contain at least one external citation
for f in "MVP_ACCEPTANCE_CRITERIA.md" "DEMO_CHECKLIST.md"; do
  if [[ -f $f ]]; then
    if ! grep -qE 'https?://' "$f"; then
      echo "[ERROR] $f lacks any http/https citations"
      missing=1
    fi
    # run a markdown link checker if available (installed via npm devDependency)
    if command -v npx >/dev/null 2>&1; then
      npx markdown-link-check -q "$f" || missing=1
    fi
  fi
 done

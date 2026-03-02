#!/usr/bin/env bash
# Validate that planning documents include required mission linkage fields

set -euo pipefail

docs=(MVP_ACCEPTANCE_CRITERIA.md TODO.md ROADMAP.md README.md docuentation/*.md)
missing=0
for f in "${docs[@]}"; do
  if [[ -f $f ]]; then
    if ! grep -qE 'Mission (outcome|linkage|impact):' "$f"; then
      echo "[ERROR] $f lacks mission linkage anchors"
      missing=1
    fi
  fi
done

if [[ $missing -ne 0 ]]; then
  echo "Documentation check failed"
  exit 1
fi

echo "Documentation check passed"

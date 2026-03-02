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

if [[ $missing -ne 0 ]]; then
  echo "Documentation check failed"
  exit 1
fi

echo "Documentation check passed"

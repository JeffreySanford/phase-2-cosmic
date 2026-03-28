#!/usr/bin/env bash
# verify that no circular dependencies exist in the Nx workspace
# usage: ./scripts/check-dep-graph.sh
set -euo pipefail

echo "Scanning Nx dependency graph for cycles..."

# nx dep-graph --scan will exit 1 if a cycle is detected
pnpm nx dep-graph --scan

echo "dependency graph check passed"
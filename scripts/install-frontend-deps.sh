#!/usr/bin/env bash
set -euo pipefail

echo "Installing workspace node dependencies (pnpm)"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found; attempting to enable corepack and install pnpm"
  corepack enable || true
  corepack prepare pnpm@latest --activate || true
fi

pnpm install --frozen-lockfile

echo "Dependencies installed. To restart frontend dev server, run your dev-compose or `pnpm run serve:ssr` as appropriate."

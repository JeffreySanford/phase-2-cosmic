#!/usr/bin/env bash
set -euo pipefail
echo "Starting dev compose environment..."
docker compose -f docker/dev-compose.yml up -d
echo "Dev compose started. Waiting for key services..."
echo "You can follow logs with: docker compose -f docker/dev-compose.yml logs -f"

# Start the frontend in the foreground so `pnpm start:all` runs both services and UI.
echo "Starting frontend (Angular) in foreground..."
if command -v pnpm >/dev/null 2>&1; then
	pnpm nx serve frontend
else
	echo "pnpm not found. To start the frontend manually run: pnpm nx serve frontend"
fi

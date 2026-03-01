#!/usr/bin/env bash
set -euo pipefail
echo "Resetting dev compose environment (down -> up)..."
docker compose -f docker/dev-compose.yml down --remove-orphans
docker compose -f docker/dev-compose.yml up -d
echo "Dev compose restarted. Use: docker compose -f docker/dev-compose.yml logs -f"

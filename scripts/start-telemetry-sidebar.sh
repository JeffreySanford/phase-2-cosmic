#!/usr/bin/env bash
set -euo pipefail

# Start the telemetry sidebar (WebSocket server for frontend)
cd "$(dirname "$0")/../tools/telemetry-sidebar"
pnpm install
pnpm exec tsx src/index.ts -- --rabbitmq amqp://guest:guest@localhost:5672 --nodeId dev-sidecar --wsPort 3333

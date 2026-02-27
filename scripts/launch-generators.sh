#!/usr/bin/env bash
# Launch multiple data-generator instances, splitting a total desired rate across workers.
# Usage: ./scripts/launch-generators.sh <num-workers> <total-rate-bytes> [payload-size]
set -euo pipefail
NUM_WORKERS=${1:-$(nproc)}
TOTAL_RATE=${2:-125000}
PAYLOAD=${3:-512}
NO_STDOUT=--no-stdout
mkdir -p tools/data-generator/logs
RATE_PER=$((TOTAL_RATE / NUM_WORKERS))
for i in $(seq 1 $NUM_WORKERS); do
  logfile="tools/data-generator/logs/payloads.${i}.bin"
  audit=1000
  echo "Starting worker $i -> rate=$RATE_PER payload=$PAYLOAD sink=$logfile"
  (cd tools/data-generator && ./data-generator-linux --rate=${RATE_PER} --payload-size=${PAYLOAD} ${NO_STDOUT} --sink=file:${logfile} --audit-every=${audit} &) 
done

echo "Launched $NUM_WORKERS workers. Use 'ps aux | grep data-generator' to inspect."

#!/usr/bin/env bash
# Run predefined load profiles against the governance API using job-publisher.js

set -euo pipefail

profile=$1
case "$profile" in
  smoke)
    export RATE=10
    export TOTAL=100
    ;;
  soak)
    export RATE=50
    export TOTAL=10000
    ;;
  stress)
    export RATE=200
    export TOTAL=50000
    ;;
  *)
    echo "Usage: $0 <smoke|soak|stress>"
    exit 1
    ;;
esac

# run the publisher script with the chosen parameters
node tools/perf/job-publisher.js

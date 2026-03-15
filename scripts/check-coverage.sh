#!/usr/bin/env bash
# report if overall coverage is below threshold (default 90%)
# checks Java JaCoCo xml and frontend/Node coverage summary
#
# Strict failure is opt-in via COVERAGE_ENFORCE_STRICT=1. The current testing
# policy tracks 90% aggregated coverage as a target while full automated
# enforcement remains backlog work.

set -euo pipefail

THRESHOLD=${1:-90}
FAILED=0
STRICT=${COVERAGE_ENFORCE_STRICT:-0}

check_jacoco() {
  if [[ -f "apps/java-governance/target/site/jacoco/jacoco.xml" ]]; then
    read -r pct miss < <(
      node - <<'NODE'
const fs = require("fs");

const xml = fs.readFileSync("apps/java-governance/target/site/jacoco/jacoco.xml", "utf8");
const match = xml.match(/<counter type="INSTRUCTION" missed="(\d+)" covered="(\d+)"/);
if (match) {
  process.stdout.write(`${match[2]} ${match[1]}\n`);
} else {
  process.stdout.write("0 0\n");
}
NODE
    )
    pct=${pct//$'\r'/}
    miss=${miss//$'\r'/}
    total=$((pct + miss))
    if [[ $total -gt 0 ]]; then
      cov=$((100 * pct / total))
      echo "Java instruction coverage: ${cov}%"
      if [[ $cov -lt $THRESHOLD ]]; then
        echo "Coverage below threshold ($THRESHOLD%)"
        FAILED=1
      fi
    fi
  else
    echo "No JaCoCo report found for java-governance; skipping Java coverage check."
  fi
}

check_node() {
  # Nx outputs coverage to coverage/{projectRoot}; check frontend first, then workspace root fallback
  local summary=""
  local cov=""
  if [[ -f "coverage/apps/frontend/coverage-summary.json" ]]; then
    summary="coverage/apps/frontend/coverage-summary.json"
  elif [[ -f "coverage/coverage-summary.json" ]]; then
    summary="coverage/coverage-summary.json"
  fi

  if [[ -n "$summary" ]]; then
    cov=$(node -e "const summary = require('./${summary}'); console.log(Math.trunc(summary.total.lines.pct));")
    cov=${cov//$'\r'/}
    echo "Node lines coverage: ${cov}% (from $summary)"
    if [[ $cov -lt $THRESHOLD ]]; then
      echo "Coverage below threshold ($THRESHOLD%)"
      FAILED=1
    fi
  else
    echo "No frontend coverage summary found."
    FAILED=1
  fi
}

check_jacoco
check_node

if [[ $FAILED -ne 0 && $STRICT -eq 1 ]]; then
  exit 1
fi

if [[ $FAILED -ne 0 ]]; then
  echo "Coverage check is informational in the current policy. Set COVERAGE_ENFORCE_STRICT=1 to fail on threshold misses."
fi

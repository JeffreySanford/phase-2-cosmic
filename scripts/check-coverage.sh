#!/usr/bin/env bash
# fail if overall coverage is below threshold (default 90%)
# checks Java JaCoCo xml and frontend/Node coverage summary

set -euo pipefail

THRESHOLD=${1:-90}
FAILED=0

check_jacoco() {
  if [[ -f "apps/java-governance/target/site/jacoco/jacoco.xml" ]]; then
    pct=$(xmllint --xpath "string(//counter[@type='INSTRUCTION']/@covered)" apps/java-governance/target/site/jacoco/jacoco.xml)
    miss=$(xmllint --xpath "string(//counter[@type='INSTRUCTION']/@missed)" apps/java-governance/target/site/jacoco/jacoco.xml)
    total=$((pct + miss))
    if [[ $total -gt 0 ]]; then
      cov=$((100 * pct / total))
      echo "Java instruction coverage: ${cov}%"
      if [[ $cov -lt $THRESHOLD ]]; then
        echo "Coverage below threshold ($THRESHOLD%)"
        FAILED=1
      fi
    fi
  fi
}

check_node() {
  if [[ -f "coverage/coverage-summary.json" ]]; then
    cov=$(jq -r '.total.lines.pct' coverage/coverage-summary.json | cut -d. -f1)
    echo "Node lines coverage: ${cov}%"
    if [[ $cov -lt $THRESHOLD ]]; then
      echo "Coverage below threshold ($THRESHOLD%)"
      FAILED=1
    fi
  fi
}

check_jacoco
check_node

if [[ $FAILED -ne 0 ]]; then
  exit 1
fi

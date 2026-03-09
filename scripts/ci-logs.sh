#!/usr/bin/env bash
# ci-logs.sh — Fetch CI workflow run logs via gh CLI for local iterative fixing.
#
# Usage:
#   sh ./scripts/ci-logs.sh              # latest failed run (auto-detect)
#   sh ./scripts/ci-logs.sh <run-id>     # specific run ID
#   sh ./scripts/ci-logs.sh --list       # list 15 most recent runs
#   sh ./scripts/ci-logs.sh --watch      # live-tail the active/latest run
#   sh ./scripts/ci-logs.sh --all <id>   # full log (not just failed steps)
#
# Output files (all in logs/):
#   ci-<run-id>-<ts>.log          raw log with timestamps intact
#   ci-<run-id>-<ts>-clean.log    timestamps stripped, markers humanised
#   ci-<run-id>-<ts>-summary.md   errors + warnings extracted as markdown
#
# Prerequisites:  gh CLI authenticated  (gh auth login)
#                 Logs expire after 90 days on GitHub.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS_DIR="${REPO_ROOT}/logs"
mkdir -p "${LOGS_DIR}"

# ---------- guards --------------------------------------------------------- #
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found."
  echo "  Install from https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

# ---------- mode parsing --------------------------------------------------- #
MODE="failed"
RUN_ID=""

case "${1:-}" in
  --list)
    echo "==> Recent workflow runs (newest first):"
    echo ""
    gh run list --limit 15 \
      --json databaseId,workflowName,status,conclusion,headBranch,createdAt \
      --jq '.[] | [
          (if .conclusion == "failure"  then "FAIL"
           elif .conclusion == "success" then "PASS"
           elif .status == "in_progress" then "RUNNING"
           else (.conclusion // .status) end),
          (.databaseId | tostring),
          .workflowName,
          .headBranch,
          .createdAt
        ] | @tsv' \
      | column -t -s $'\t'
    echo ""
    echo "Tip: pnpm run ci:logs <run-id>  to fetch logs for a specific run."
    exit 0
    ;;

  --watch)
    ACTIVE=$(gh run list --limit 10 \
      --json databaseId,status \
      --jq '[.[] | select(.status == "in_progress" or .status == "queued")]
            | .[0].databaseId // empty')
    if [ -z "${ACTIVE}" ]; then
      echo "No active runs found. Watching the latest completed run instead."
      ACTIVE=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
    fi
    echo "==> Watching run ${ACTIVE} — press Ctrl-C to stop."
    gh run watch "${ACTIVE}"
    # After it finishes, offer to pull the logs
    echo ""
    read -r -p "Run finished. Fetch failed logs now? [Y/n] " REPLY
    REPLY="${REPLY:-Y}"
    if [ "${REPLY}" = "Y" ] || [ "${REPLY}" = "y" ]; then
      exec "$0" "${ACTIVE}"
    fi
    exit 0
    ;;

  --all)
    MODE="all"
    RUN_ID="${2:-}"
    ;;

  --help | -h)
    head -14 "$0" | tail -12
    exit 0
    ;;

  "")
    MODE="failed"
    ;;

  [0-9]*)
    RUN_ID="${1}"
    ;;

  *)
    echo "Unknown argument: ${1}. Run with --help for usage."
    exit 1
    ;;
esac

# ---------- auto-detect latest failed run ---------------------------------- #
if [ -z "${RUN_ID}" ]; then
  echo "==> Searching for the latest failed run..."
  RUN_ID=$(gh run list --limit 20 \
    --json databaseId,conclusion \
    --jq '[.[] | select(.conclusion == "failure")] | .[0].databaseId // empty')

  if [ -z "${RUN_ID}" ]; then
    echo "No failed runs found in the last 20 runs. Nice work!"
    echo ""
    echo "Use 'pnpm run ci:logs:list' to see all recent runs."
    exit 0
  fi
  echo "==> Found run: ${RUN_ID}"
fi

# ---------- run summary ---------------------------------------------------- #
echo ""
echo "==> Run ${RUN_ID}:"
gh run view "${RUN_ID}" \
  --json workflowName,conclusion,headBranch,createdAt,jobs \
  --jq '"  Workflow : " + .workflowName,
        "  Branch   : " + .headBranch,
        "  Result   : " + (.conclusion // "unknown"),
        "  Created  : " + .createdAt,
        "",
        "  Jobs:",
        (.jobs[] |
          "  " +
          (if .conclusion == "failure" then "[FAIL]" else "[pass]" end) +
          "  " + .name),
        "",
        "  Failed steps:",
        (.jobs[].steps[] |
          select(.conclusion == "failure") |
          "    -> " + .name)'
echo ""

# ---------- download logs -------------------------------------------------- #
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
LOGFILE="${LOGS_DIR}/ci-${RUN_ID}-${TIMESTAMP}.log"
CLEAN_LOG="${LOGS_DIR}/ci-${RUN_ID}-${TIMESTAMP}-clean.log"
SUMMARY="${LOGS_DIR}/ci-${RUN_ID}-${TIMESTAMP}-summary.md"

echo "==> Downloading logs..."

if [ "${MODE}" = "all" ]; then
  gh run view "${RUN_ID}" --log > "${LOGFILE}" 2>&1 || true
else
  gh run view "${RUN_ID}" --log-failed > "${LOGFILE}" 2>&1 || true
fi

if [ ! -s "${LOGFILE}" ]; then
  echo "No log output captured."
  echo "  The run may still be in progress, or logs may have expired (90-day limit)."
  echo "  Try: pnpm run ci:logs:list  to find the right run ID."
  rm -f "${LOGFILE}"
  exit 0
fi

# ---------- clean log (strip timestamps + GitHub log markers) -------------- #
sed \
  -e 's/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}T[0-9]\{2\}:[0-9]\{2\}:[0-9]\{2\}\.[0-9]*Z //' \
  -e 's/##\[group\]//g' \
  -e 's/##\[endgroup\]//g' \
  -e 's/##\[error\]/ERROR: /g' \
  -e 's/##\[warning\]/WARNING: /g' \
  "${LOGFILE}" > "${CLEAN_LOG}"

# ---------- summary report ------------------------------------------------- #
{
  echo "# CI Failure Summary"
  echo ""
  echo "| Field    | Value |"
  echo "|----------|-------|"
  echo "| Run ID   | ${RUN_ID} |"
  echo "| Fetched  | ${TIMESTAMP} |"
  echo "| Raw log  | \`${LOGFILE}\` |"
  echo "| Clean log| \`${CLEAN_LOG}\` |"
  echo ""
  echo "## Errors"
  echo ""
  echo "\`\`\`"
  grep -E "(ERROR:|error\]|✘ \[ERROR\]|FAILED|Build FAILED|Exit code [1-9]|target.*failed)" \
    "${CLEAN_LOG}" \
    | grep -v "##\[" \
    | sed 's/^[^\t]*\t[^\t]*\t//' \
    | sort -u \
    | head -60 \
    || echo "(no error lines matched)"
  echo "\`\`\`"
  echo ""
  echo "## Warnings"
  echo ""
  echo "\`\`\`"
  grep -E "(WARNING:|warning\]|▲ \[WARNING\]|exceeded.*budget)" \
    "${CLEAN_LOG}" \
    | sed 's/^[^\t]*\t[^\t]*\t//' \
    | sort -u \
    | head -30 \
    || echo "(no warning lines matched)"
  echo "\`\`\`"
  echo ""
  echo "## Next steps"
  echo ""
  echo "1. Fix the errors above in your local working tree."
  echo "2. Run \`pnpm run quality:ci\` locally to verify the fix."
  echo "3. Push — then run \`pnpm run ci:logs\` after the next CI run."
} > "${SUMMARY}"

# ---------- print inline error summary ------------------------------------ #
echo "==> Error lines from failed steps:"
echo "------------------------------------------------------------------------"
grep -E "(ERROR:|error\]|✘ \[ERROR\]|FAILED|Build FAILED|target.*failed)" \
  "${CLEAN_LOG}" \
  | sed 's/^[^\t]*\t[^\t]*\t//' \
  | head -40 \
  || echo "(no error lines matched in failed-step logs)"
echo "------------------------------------------------------------------------"
echo ""
echo "==> Saved:"
printf "    Raw log : %s\n" "${LOGFILE}"
printf "    Clean   : %s\n" "${CLEAN_LOG}"
printf "    Summary : %s\n" "${SUMMARY}"
echo ""
echo "Next: fix the errors, then run: pnpm run ci:logs"

#!/usr/bin/env bash
# ci-codeql.sh — Fetch CodeQL SARIF results from CI, parse and report locally.
#
# Usage:
#   sh ./scripts/ci-codeql.sh              # fetch + parse latest CodeQL run
#   sh ./scripts/ci-codeql.sh --list       # list recent CodeQL workflow runs
#   sh ./scripts/ci-codeql.sh <run-id>     # fetch SARIF from a specific run
#   sh ./scripts/ci-codeql.sh --trigger    # kick off a new CodeQL run now
#
# How CodeQL works in this repo:
#   - .github/workflows/codeql.yml runs on push/PR and weekly (Mon 03:00 UTC).
#   - It analyses TypeScript/JavaScript, Java, and Go separately.
#   - Each matrix leg uploads a SARIF artifact (codeql-results/<language>/).
#   - On PUBLIC repos: findings appear in GitHub Security tab automatically.
#   - On PRIVATE repos without GHAS: SARIF is produced but the Security tab
#     integration is unavailable. This script downloads and parses SARIF
#     artifacts locally so you can review findings without GHAS.
#
# Prerequisites:
#   - gh CLI authenticated (gh auth login)
#   - jq  (brew install jq  /  apt install jq  /  winget install jqlang.jq)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS_DIR="${REPO_ROOT}/logs/codeql"
mkdir -p "${LOGS_DIR}"

# ---------- guards --------------------------------------------------------- #
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

JQ_AVAILABLE=false
if command -v jq >/dev/null 2>&1; then
  JQ_AVAILABLE=true
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "==> Repository: ${REPO}"

# ---------- --trigger mode ------------------------------------------------- #
if [ "${1:-}" = "--trigger" ]; then
  echo "==> Triggering CodeQL analysis workflow..."
  gh workflow run codeql.yml
  echo "  CodeQL workflow dispatched."
  echo "  Monitor with: pnpm run ci:logs:watch"
  echo "  Fetch results when done: pnpm run ci:codeql"
  exit 0
fi

# ---------- --list mode ---------------------------------------------------- #
if [ "${1:-}" = "--list" ]; then
  echo "==> Recent CodeQL workflow runs:"
  echo ""
  RUNS=$(gh run list --workflow=codeql.yml --limit 10 \
    --json databaseId,status,conclusion,createdAt,displayTitle 2>/dev/null \
    || echo "[]")
  if [ "${RUNS}" = "[]" ] || [ -z "${RUNS}" ]; then
    echo "No CodeQL runs found yet."
    echo ""
    echo "The workflow runs automatically on push/PR to main."
    echo "Trigger manually: pnpm run ci:codeql:trigger"
  else
    echo "${RUNS}" | gh run list --workflow=codeql.yml --limit 10 \
      --json databaseId,status,conclusion,createdAt,displayTitle \
      --jq '.[] | [
          (if .conclusion == "failure"  then "FAIL"
           elif .conclusion == "success" then "PASS"
           elif .status == "in_progress" then "RUNNING"
           else (.conclusion // .status) end),
          (.databaseId | tostring),
          (.conclusion // .status),
          .createdAt,
          .displayTitle
        ] | @tsv' \
      | column -t -s $'\t' 2>/dev/null \
    || echo "Use 'gh run list --workflow=codeql.yml' to inspect manually."
  fi
  exit 0
fi

# ---------- resolve run ID ------------------------------------------------- #
RUN_ID="${1:-}"

if [ -z "${RUN_ID}" ]; then
  echo "==> Looking for latest CodeQL run..."
  RUN_ID=$(gh run list --workflow=codeql.yml --limit 1 \
    --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)

  if [ -z "${RUN_ID}" ]; then
    echo ""
    echo "No CodeQL runs found yet."
    echo ""
    echo "The .github/workflows/codeql.yml workflow runs on:"
    echo "  - Every push / PR to main"
    echo "  - Weekly on Monday at 03:00 UTC"
    echo ""
    echo "To trigger it immediately:"
    echo "  pnpm run ci:codeql:trigger"
    echo ""
    echo "To run CodeQL locally using the CodeQL CLI:"
    echo "  https://docs.github.com/en/code-security/codeql-cli/getting-started-with-the-codeql-cli"
    exit 0
  fi
fi

echo "==> CodeQL run: ${RUN_ID}"

# ---------- show run summary ----------------------------------------------- #
gh run view "${RUN_ID}" \
  --json workflowName,conclusion,createdAt,jobs \
  --jq '"  Workflow : " + .workflowName,
        "  Result   : " + (.conclusion // "in progress"),
        "  Created  : " + .createdAt,
        "",
        "  Matrix legs:",
        (.jobs[] |
          "  " +
          (if .conclusion == "failure" then "[FAIL]"
           elif .conclusion == "success" then "[pass]"
           else "[" + (.status // "?") + "]" end) +
          "  " + .name)'
echo ""

# ---------- download SARIF artifacts --------------------------------------- #
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
DOWNLOAD_DIR="${LOGS_DIR}/run-${RUN_ID}"
mkdir -p "${DOWNLOAD_DIR}"

echo "==> Downloading artifacts from run ${RUN_ID}..."
gh run download "${RUN_ID}" --dir "${DOWNLOAD_DIR}" 2>&1 || {
  echo ""
  echo "WARNING: Could not download artifacts."
  echo "  Possible reasons:"
  echo "  - The run failed before producing SARIF output."
  echo "  - On private repos without GHAS, SARIF may not be uploaded."
  echo "  - Artifacts expire after 90 days."
  echo ""
  echo "Falling back to raw log inspection..."
  echo "  sh ./scripts/ci-logs.sh ${RUN_ID}"
  exit 0
}

# ---------- locate SARIF files --------------------------------------------- #
SARIF_FILES=$(find "${DOWNLOAD_DIR}" -name "*.sarif" 2>/dev/null | sort || true)

if [ -z "${SARIF_FILES}" ]; then
  echo ""
  echo "No SARIF files found in downloaded artifacts."
  echo ""
  echo "Artifacts downloaded to: ${DOWNLOAD_DIR}"
  echo "Contents:"
  find "${DOWNLOAD_DIR}" -type f | sed 's|^|  |'
  echo ""
  echo "On private repos without GitHub Advanced Security, CodeQL uploads SARIF"
  echo "to the Security tab (which requires GHAS) but may not include it as a"
  echo "downloadable artifact."
  echo ""
  echo "Alternatives:"
  echo "  1. View raw run logs: sh ./scripts/ci-logs.sh ${RUN_ID}"
  echo "  2. Run CodeQL CLI locally (free, open-source):"
  echo "     https://docs.github.com/en/code-security/codeql-cli"
  exit 0
fi

# ---------- parse SARIF ---------------------------------------------------- #
REPORT_FILE="${LOGS_DIR}/codeql-${TIMESTAMP}.md"
TOTAL_FINDINGS=0

{
  echo "# CodeQL Findings Report"
  echo ""
  echo "| Field   | Value |"
  echo "|---------|-------|"
  echo "| Run ID  | ${RUN_ID} |"
  echo "| Date    | ${TIMESTAMP} |"
  echo "| Repo    | ${REPO} |"
  echo ""
  echo "---"
  echo ""
} > "${REPORT_FILE}"

for SARIF in ${SARIF_FILES}; do
  LANG=$(basename "$(dirname "${SARIF}")")
  echo "==> Parsing SARIF: ${SARIF} (${LANG})"

  if [ "${JQ_AVAILABLE}" = "true" ]; then
    # Extract each result: severity, file, line, rule, message
    FINDINGS=$(jq -r '
      .runs[] |
      (.tool.driver.name) as $tool |
      (.results // [])[] |
      . as $r |
      ($r.locations[0].physicalLocation.artifactLocation.uri // "unknown") as $f |
      ($r.locations[0].physicalLocation.region.startLine // 0 | tostring) as $l |
      ($r.ruleId // "?") as $rule |
      ($r.level // "warning") as $level |
      ($r.message.text // "" | gsub("\n"; " ")) as $msg |
      "[\($level | ascii_upcase)] \($f):\($l)\n  Rule: \($rule)\n  Tool: \($tool)\n  Msg : \($msg)\n"
    ' "${SARIF}" 2>/dev/null || echo "(SARIF parse error — inspect manually: ${SARIF})")

    COUNT=$(echo "${FINDINGS}" | grep -c "^\[" 2>/dev/null || echo 0)
    TOTAL_FINDINGS=$((TOTAL_FINDINGS + COUNT))

    {
      echo "## ${LANG} — $(basename "${SARIF}")"
      echo ""
      if [ "${COUNT}" -gt 0 ]; then
        echo "\`\`\`"
        echo "${FINDINGS}"
        echo "\`\`\`"
      else
        echo "No findings. Clean!"
      fi
      echo ""
    } >> "${REPORT_FILE}"

    # Print findings inline
    if [ "${COUNT}" -gt 0 ]; then
      echo ""
      echo "  ${COUNT} finding(s):"
      echo "${FINDINGS}" | head -40
      echo ""
    else
      echo "  Clean — no findings."
    fi
  else
    echo "  jq not found — SARIF saved for manual inspection: ${SARIF}"
    {
      echo "## ${LANG}"
      echo ""
      echo "jq not available. Inspect raw file: \`${SARIF}\`"
      echo ""
    } >> "${REPORT_FILE}"
  fi
done

# ---------- try live code-scanning API (GHAS) ------------------------------ #
echo ""
echo "==> Checking GitHub code-scanning API (requires GHAS on private repos)..."
API_RESULT=$(gh api "repos/${REPO}/code-scanning/alerts" \
  --jq '
    .[] |
    "[\(.rule.severity | ascii_upcase)] \(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line // 0)\n  Rule: \(.rule.id)\n  Desc: \(.rule.description)\n  URL : \(.html_url)\n"
  ' 2>/dev/null || echo "")

if [ -n "${API_RESULT}" ]; then
  echo "  Live alerts found (GHAS is available)."
  {
    echo "## Live Alerts (GitHub Advanced Security)"
    echo ""
    echo "\`\`\`"
    echo "${API_RESULT}"
    echo "\`\`\`"
    echo ""
  } >> "${REPORT_FILE}"
else
  echo "  No live alerts (GHAS not enabled or no alerts open)."
  {
    echo "## GitHub Advanced Security"
    echo ""
    echo "No live alerts returned from the code-scanning API."
    echo "GHAS is not required — SARIF is parsed locally above."
    echo ""
  } >> "${REPORT_FILE}"
fi

# ---------- final summary -------------------------------------------------- #
{
  echo "---"
  echo ""
  echo "## How to fix findings"
  echo ""
  echo "1. Open the file at the reported line."
  echo "2. Review the rule description (search the rule ID at semgrep.dev"
  echo "   or codeql.github.com/codeql-query-help)."
  echo "3. Apply the fix locally."
  echo "4. Run \`pnpm run quality:ci\` to verify."
  echo "5. Push — CodeQL will re-run automatically on next push."
  echo ""
  echo "SARIF files: \`${DOWNLOAD_DIR}\`"
} >> "${REPORT_FILE}"

echo ""
echo "==> Done."
printf "    Report: %s\n" "${REPORT_FILE}"
printf "    SARIF : %s\n" "${DOWNLOAD_DIR}"
echo ""
if [ "${TOTAL_FINDINGS}" -gt 0 ]; then
  echo "  Total findings: ${TOTAL_FINDINGS}"
  echo "  Review the report and fix findings before next push."
else
  echo "  No findings. Codebase is clean!"
fi

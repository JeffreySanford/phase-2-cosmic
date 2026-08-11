#!/usr/bin/env bash
#
# Reclaim accumulated governance job records.
#
# Goes through the governance API rather than redis-cli. The store holds job,
# provenance and audit records, so a destructive sweep over it belongs behind
# the same endpoint, auth filter and audit trail as every other mutation --
# docker exec redis-cli bypasses all three and leaves no trace of who ran it.
#
# A dry run unless --apply is passed.
#
set -euo pipefail

# Governance publishes container 8080 on host 8082 (docker/dev-compose.yml).
API="${GOVERNANCE_API:-http://127.0.0.1:8082/api/v1}"
KEEP_RECENT="${KEEP_RECENT:-0}"
APPLY=0

usage() {
    cat <<'USAGE'
Usage: redis-purge-jobs.sh [--apply] [--keep-recent N] [--api URL]

  --apply           actually delete. Without it, only report.
  --keep-recent N   retain the N newest jobs by createdAt (default 0 = all go).
  --api URL         governance API base (default http://127.0.0.1:8082/api/v1)

Environment: GOVERNANCE_API, KEEP_RECENT, GOVERNANCE_AUTH_TOKEN
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --keep-recent) KEEP_RECENT="$2"; shift ;;
        --api) API="$2"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
    esac
    shift
done

auth=()
if [ -n "${GOVERNANCE_AUTH_TOKEN:-}" ]; then
    auth=(-H "Authorization: Bearer ${GOVERNANCE_AUTH_TOKEN}")
fi

call() {
    local method="$1" path="$2" data="${3:-}"
    if [ -n "$data" ]; then
        curl -fsS -X "$method" "${auth[@]}" -H 'Content-Type: application/json' -d "$data" "${API}${path}"
    else
        curl -fsS -X "$method" "${auth[@]}" "${API}${path}"
    fi
}

# Probe for the endpoint's own payload, not merely a 2xx. An unrelated service
# on the same port answers 200 with HTML, and treating that as "governance is
# up" would report a purge against something that was never asked.
probe="$(call GET /admin/job-store 2>/dev/null || true)"
case "$probe" in
    *jobRecords*) ;;
    *)
        echo "[purge] no governance job-store endpoint at ${API}" >&2
        if [ -n "$probe" ]; then
            echo "[purge] something answered, but not this API -- check the port" >&2
        fi
        echo "[purge] start the stack, or pass --api / set GOVERNANCE_API" >&2
        exit 1
        ;;
esac

echo "[purge] api: ${API}"
echo "[purge] store before:"
call GET /admin/job-store | sed 's/^/[purge]   /'

if [ "$APPLY" -eq 0 ]; then
    echo "[purge] DRY RUN. Nothing will be deleted."
    call POST /admin/job-store/purge "{\"keepRecent\":${KEEP_RECENT},\"dryRun\":true}" | sed 's/^/[purge]   /'
    echo "[purge] re-run with --apply to proceed"
    exit 0
fi

echo "[purge] applying, keeping the ${KEEP_RECENT} newest jobs"
call POST /admin/job-store/purge "{\"keepRecent\":${KEEP_RECENT},\"dryRun\":false}" | sed 's/^/[purge]   /'

echo "[purge] store after:"
call GET /admin/job-store | sed 's/^/[purge]   /'

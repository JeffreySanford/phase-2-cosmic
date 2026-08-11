#!/usr/bin/env bash
#
# Remove accumulated governance job keys from the dev Redis.
#
# A running dev stack was measured growing Redis by 15 keys/sec with no expiry
# on any job key, reaching 2,044,218 keys and 765 MB. Each job costs three keys
# -- the record, its :logs and its :artifacts -- plus a member in the createdAt
# index. Stopping the source (governance.ingest.create-jobs) prevents further
# growth but removes nothing already stored; this reclaims that.
#
# Refuses to do anything until --apply is passed. The default is a dry run that
# reports what would go and leaves the store untouched.
#
# Deliberate choices:
#   SCAN, not KEYS       -- KEYS blocks the server for the whole sweep, and this
#                           sweep is over millions of keys.
#   UNLINK, not DEL      -- frees memory on a background thread rather than
#                           stalling the event loop on a large batch.
#   Index pruned too     -- PR #44 records that an index entry pointing at a
#                           missing record consumes a slot in every listing
#                           window and returns nothing for it. Dropping records
#                           without pruning the index degrades the Jobs view
#                           instead of fixing it.
#
set -euo pipefail

CONTAINER="${REDIS_CONTAINER:-docker-redis-1}"
BATCH="${PURGE_BATCH:-2000}"
APPLY=0
KEEP_RECENT="${KEEP_RECENT:-0}"

usage() {
    cat <<'USAGE'
Usage: redis-purge-jobs.sh [--apply] [--keep-recent N] [--container NAME]

  --apply           actually delete. Without it, only report.
  --keep-recent N   retain the N newest jobs by createdAt index score.
  --container NAME  redis container (default: docker-redis-1)

Environment: REDIS_CONTAINER, PURGE_BATCH, KEEP_RECENT
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --keep-recent) KEEP_RECENT="$2"; shift ;;
        --container) CONTAINER="$2"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
    esac
    shift
done

redis() { docker exec "$CONTAINER" redis-cli "$@"; }

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "[purge] redis container '$CONTAINER' not found" >&2
    exit 1
fi

echo "[purge] container: $CONTAINER"
before_keys="$(redis DBSIZE | tr -d '\r')"
before_mem="$(redis INFO memory | grep -E '^used_memory_human:' | cut -d: -f2 | tr -d '\r')"
index_card="$(redis ZCARD job:index:createdAt | tr -d '\r')"
echo "[purge] before: ${before_keys} keys, ${before_mem}, createdAt index holds ${index_card} jobs"

# Ids to keep, newest-first by index score. Everything else is fair game.
keep_file="$(mktemp)"
trap 'rm -f "$keep_file"' EXIT
if [ "$KEEP_RECENT" -gt 0 ]; then
    redis ZREVRANGE job:index:createdAt 0 "$((KEEP_RECENT - 1))" | tr -d '\r' | sort > "$keep_file"
    echo "[purge] keeping the $(wc -l < "$keep_file" | tr -d ' ') newest jobs"
else
    : > "$keep_file"
fi

if [ "$APPLY" -eq 0 ]; then
    would_go=$((before_keys - $(wc -l < "$keep_file" | tr -d ' ') * 3))
    echo "[purge] DRY RUN. Nothing was deleted."
    echo "[purge] would remove on the order of ${would_go} keys and free most of ${before_mem}"
    echo "[purge] re-run with --apply to proceed"
    exit 0
fi

echo "[purge] deleting job keys in batches of ${BATCH} (UNLINK, non-blocking)"
deleted=0
cursor=0
while :; do
    # SCAN returns the next cursor on line 1 and the batch after it.
    out="$(redis SCAN "$cursor" MATCH 'job:*' COUNT "$BATCH" | tr -d '\r')"
    cursor="$(printf '%s\n' "$out" | head -1)"
    batch="$(printf '%s\n' "$out" | tail -n +2)"

    # Never touch the indexes themselves; they are pruned separately below.
    batch="$(printf '%s\n' "$batch" | grep -v '^job:index:' || true)"

    if [ -n "$batch" ] && [ -s "$keep_file" ]; then
        # Field 2 is the job id for all three shapes: job:<id>, job:<id>:logs
        # and job:<id>:artifacts, so one membership test covers the set.
        batch="$(printf '%s\n' "$batch" | awk -F: 'NR==FNR { keep[$0]; next } !($2 in keep)' "$keep_file" -)"
    fi

    if [ -n "$batch" ]; then
        count="$(printf '%s\n' "$batch" | grep -c . || true)"
        printf '%s\n' "$batch" | xargs -r docker exec -i "$CONTAINER" redis-cli UNLINK >/dev/null 2>&1 || true
        deleted=$((deleted + count))
        printf '\r[purge] removed %s keys' "$deleted"
    fi

    [ "$cursor" = "0" ] && break
done
printf '\n'

# Prune the index to the ids that still have a record, so listings do not walk
# past entries that resolve to nothing.
if [ "$KEEP_RECENT" -gt 0 ]; then
    echo "[purge] trimming createdAt index to the ${KEEP_RECENT} newest"
    redis ZREMRANGEBYRANK job:index:createdAt 0 "$(( -KEEP_RECENT - 1 ))" >/dev/null
else
    echo "[purge] clearing createdAt index"
    redis UNLINK job:index:createdAt >/dev/null
fi
redis UNLINK job:index:requestIds >/dev/null 2>&1 || true
# The backfill marker must go too: leaving it set tells governance the index is
# already built, so a rebuilt index would stay empty.
redis UNLINK job:index:createdAt:backfilled >/dev/null 2>&1 || true

after_keys="$(redis DBSIZE | tr -d '\r')"
after_mem="$(redis INFO memory | grep -E '^used_memory_human:' | cut -d: -f2 | tr -d '\r')"
echo "[purge] after: ${after_keys} keys, ${after_mem}"
echo "[purge] removed $((before_keys - after_keys)) keys"

#!/usr/bin/env bash
set -euo pipefail
# Collect passive system specs and optionally run active benchmarks when DIAG_RUN=true

OUT_DIR="$(pwd)/logs"
OUT_FILE="$OUT_DIR/system-specs.txt"
mkdir -p "$OUT_DIR"

echo "==== system-specs START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==== " | tee -a "$OUT_FILE"

echo "Hostname: $(hostname)" | tee -a "$OUT_FILE"
echo "Uname: $(uname -a)" | tee -a "$OUT_FILE"

echo "-- CPU --" | tee -a "$OUT_FILE"
if command -v lscpu >/dev/null 2>&1; then
  lscpu | tee -a "$OUT_FILE"
else
  echo "lscpu not available; using /proc/cpuinfo summary" | tee -a "$OUT_FILE"
  awk -F: '/model name/ {print $2; exit}' /proc/cpuinfo | sed 's/^\s*//' | tee -a "$OUT_FILE"
  echo "CPUs: $(nproc)" | tee -a "$OUT_FILE"
fi

echo "-- Memory --" | tee -a "$OUT_FILE"
if command -v free >/dev/null 2>&1; then
  free -h | tee -a "$OUT_FILE"
else
  awk '/MemTotal/ {print $0}' /proc/meminfo | tee -a "$OUT_FILE"
fi

echo "-- Disk --" | tee -a "$OUT_FILE"
if command -v lsblk >/dev/null 2>&1; then
  lsblk -o NAME,TYPE,SIZE,MOUNTPOINT | tee -a "$OUT_FILE"
  df -h --total / | tee -a "$OUT_FILE" || true
else
  df -h / | tee -a "$OUT_FILE"
fi

echo "-- Network --" | tee -a "$OUT_FILE"
if command -v ip >/dev/null 2>&1; then
  ip -br address | tee -a "$OUT_FILE"
  ip -s link | tee -a "$OUT_FILE"
fi
if command -v ethtool >/dev/null 2>&1; then
  for IF in $(ls /sys/class/net); do
    echo "ethtool $IF:" | tee -a "$OUT_FILE"
    ethtool $IF 2>/dev/null | tee -a "$OUT_FILE" || true
  done
fi

echo "-- Mounted FS types --" | tee -a "$OUT_FILE"
cat /proc/filesystems | tee -a "$OUT_FILE"

# If DIAG_RUN is set, run active benchmarks if fio/iperf3 exist
if [ "${DIAG_RUN:-false}" = "true" ]; then
  echo "-- DIAG_RUN enabled: running active benchmarks (only if tools available) --" | tee -a "$OUT_FILE"

  if command -v fio >/dev/null 2>&1; then
    echo "Running fio sample (10s, 1M bs)" | tee -a "$OUT_FILE"
    fio --name=seqwrite --filename="$OUT_DIR/fio-testfile" --rw=write --bs=1M --size=100M --iodepth=16 --direct=1 --numjobs=1 --runtime=10 --time_based --group_reporting 2>&1 | tee -a "$OUT_FILE"
    rm -f "$OUT_DIR/fio-testfile"
  else
    echo "fio not installed; skipping disk benchmark" | tee -a "$OUT_FILE"
  fi

  if command -v iperf3 >/dev/null 2>&1; then
    if [ -n "${DIAG_IPERF_TARGET:-}" ]; then
      echo "Running iperf3 client to $DIAG_IPERF_TARGET" | tee -a "$OUT_FILE"
      iperf3 -c "$DIAG_IPERF_TARGET" -P 4 -t 10 -J 2>&1 | tee -a "$OUT_FILE" || true
    else
      echo "DIAG_IPERF_TARGET not set; skipping iperf3 active test" | tee -a "$OUT_FILE"
    fi
  else
    echo "iperf3 not installed; skipping network benchmark" | tee -a "$OUT_FILE"
  fi
fi

echo "==== system-specs END $(date -u +%Y-%m-%dT%H:%M:%SZ) ==== " | tee -a "$OUT_FILE"

exit 0

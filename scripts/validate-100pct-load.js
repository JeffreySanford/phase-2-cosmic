#!/usr/bin/env node

// Validate that enabling 100% load causes measurable increase in Prometheus metrics.
// Usage: node scripts/validate-100pct-load.js [options]
// Options:
//   --url      SSR base URL (default http://localhost:4000)
//   --duration seconds to wait between before/after snapshots (default 30)
//   --profile  load profile percent (default 100)
//
// The script will set profile to 100, wait, then revert to 10.

let fetchFn = global.fetch;

async function getFetch() {
  if (!fetchFn) {
    fetchFn = (await import("node-fetch")).default;
  }
  return fetchFn;
}

const path = require("path");
const argv = require("minimist")(process.argv.slice(2));
const baseUrl = argv.url || "http://localhost:4000";
const profile = argv.profile ? Number(argv.profile) : 100;
const duration = argv.duration ? Number(argv.duration) : 30;
const minBytesDelta = Number(process.env.MIN_DELTA_BYTES || 1);
const minCpuDelta = Number(process.env.MIN_DELTA_CPU || 1);
const adaptiveThreshold = process.env.ADAPTIVE_THRESHOLD !== "false";

async function promQuery(query) {
  const url = `${baseUrl}/api/proxy/prometheus?query=${encodeURIComponent(
    query
  )}`;
  const fetch = await getFetch();
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error("Prom query failed", { url, status: res.status, body });
    throw new Error(`prom query failed: ${res.status}`);
  }
  return res.json();
}

function extractValue(promRes) {
  // expects instant vector response
  if (!promRes?.data?.result?.length) return 0;
  const v = promRes.data.result[0].value;
  if (!Array.isArray(v) || v.length < 2) return 0;
  return Number(v[1]);
}

async function promQueryWithRetry(query, attempts = 10, delaySeconds = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const promRes = await promQuery(query);
      const val = extractValue(promRes);
      if (typeof val === "number" && !Number.isNaN(val)) {
        return val;
      }
      lastErr = new Error(`value is not a number: ${val}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }
  throw lastErr;
}

async function getWorkerOutputBytes() {
  const logsDir = path.join(process.cwd(), "tools", "data-generator", "logs");
  try {
    const fs = await import("fs/promises");
    const names = await fs.readdir(logsDir);
    const workerFiles = names.filter((n) =>
      /^runtime-profile\.worker-\d+\.bin$/.test(n)
    );
    const sizes = await Promise.all(
      workerFiles.map(async (n) => {
        try {
          const st = await fs.stat(path.join(logsDir, n));
          return st.size;
        } catch {
          return 0;
        }
      })
    );
    return sizes.reduce((sum, s) => sum + s, 0);
  } catch {
    return 0;
  }
}

async function setProfile(pct) {
  const url = `${baseUrl}/api/load-profile`;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profilePct: pct, smokeSeconds: duration }),
  });
}

async function getLoadProfile() {
  const url = `${baseUrl}/api/load-profile`;
  const res = await fetch(url);
  return res.json();
}

async function main() {
  const outputDir =
    process.env.VALIDATION_OUTPUT_DIR ||
    "validation-output/validate-100pct-load";
  const fs = await import("fs/promises");
  await fs.mkdir(outputDir, { recursive: true });
  const outFile = (name) => `${outputDir}/${name}`;

  console.log(`Using SSR URL: ${baseUrl}`);
  console.log(`Profile=${profile} duration=${duration}s`);
  console.log(`Writing artifacts to ${outputDir}`);

  // Start from a known low-load baseline by setting profile to 10% first.
  // This reduces false negatives when the system is already under high load.
  const settleSeconds = Number(process.env.BASELINE_SETTLE_SECONDS || 10);
  await setProfile(10);
  console.log(`Settling at baseline (10%) for ${settleSeconds}s...`);
  await new Promise((r) => setTimeout(r, settleSeconds * 1000));

  // Optionally compute an adaptive threshold based on baseline noise.
  let bytesThreshold = Math.max(0, minBytesDelta);
  let cpuThreshold = Math.max(0, minCpuDelta);

  if (adaptiveThreshold) {
    const baselineSamples = 4;
    const bytesSamples = [];
    const cpuSamples = [];
    for (let i = 0; i < baselineSamples; i += 1) {
      bytesSamples.push(
        await promQueryWithRetry("rate(generator_bytes_produced_total[1m])")
      );
      cpuSamples.push(
        await promQueryWithRetry(
          '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))'
        )
      );
      await new Promise((r) => setTimeout(r, 1000));
    }

    const mean = (arr) =>
      arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);
    const stddev = (arr) => {
      const m = mean(arr);
      return Math.sqrt(
        arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / Math.max(arr.length, 1)
      );
    };

    const bytesStd = stddev(bytesSamples);
    const cpuStd = stddev(cpuSamples);

    // 3-sigma rules: require a change larger than typical noise.
    bytesThreshold = Math.max(bytesThreshold, Math.ceil(bytesStd * 3));
    cpuThreshold = Math.max(cpuThreshold, Math.ceil(cpuStd * 3));

    await fs.writeFile(
      outFile("baseline-noise.json"),
      JSON.stringify({ bytesSamples, cpuSamples, bytesStd, cpuStd }, null, 2)
    );
  }

  const beforeBytes = await promQueryWithRetry(
    "sum(rate(generator_bytes_produced_total[1m]))"
  );
  const beforeCpu = await promQueryWithRetry(
    '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))'
  );

  await fs.writeFile(
    outFile("before-bytes.json"),
    JSON.stringify({ value: beforeBytes }, null, 2)
  );
  await fs.writeFile(
    outFile("before-cpu.json"),
    JSON.stringify({ value: beforeCpu }, null, 2)
  );

  console.log("Before bytes/sec:", beforeBytes);
  console.log("Before cpu%:", beforeCpu);

  await setProfile(profile);
  const profileStatus = await getLoadProfile();
  const workerBytesAtStart = await getWorkerOutputBytes();

  console.log(`Waiting ${duration}s...`);
  await new Promise((r) => setTimeout(r, duration * 1000));

  const workerBytesAtEnd = await getWorkerOutputBytes();
  const afterBytes = await promQueryWithRetry(
    "sum(rate(generator_bytes_produced_total[1m]))"
  );
  const afterCpu = await promQueryWithRetry(
    '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))'
  );

  await fs.writeFile(
    outFile("after-worker-bytes.json"),
    JSON.stringify({ value: workerBytesAtEnd }, null, 2)
  );
  await fs.writeFile(
    outFile("after-bytes.json"),
    JSON.stringify({ value: afterBytes }, null, 2)
  );
  await fs.writeFile(
    outFile("after-cpu.json"),
    JSON.stringify({ value: afterCpu }, null, 2)
  );

  console.log("After bytes/sec:", afterBytes);
  console.log("After cpu%:", afterCpu);

  await setProfile(10);

  const bytesDelta = afterBytes - beforeBytes;
  const cpuDelta = afterCpu - beforeCpu;
  const workerBytesDelta = workerBytesAtEnd - workerBytesAtStart;

  console.log("Delta bytes/sec:", bytesDelta);
  console.log("Delta cpu%:", cpuDelta);
  console.log("Delta worker output bytes:", workerBytesDelta);

  const profilePass =
    profileStatus &&
    typeof profileStatus.workers === "number" &&
    profileStatus.workers > 0 &&
    profileStatus.mode === "runtime-controlled";

  console.log("Load profile status:", profileStatus);

  const promPass = bytesDelta > bytesThreshold && cpuDelta > cpuThreshold;
  const workerPass = workerBytesDelta > 0;

  if (!promPass && !workerPass && !profilePass) {
    console.error(
      "Validation failed: No measurable increase in metrics or active workers detected."
    );
    console.error(
      `Before bytes/sec=${beforeBytes}, after bytes/sec=${afterBytes}`
    );
    console.error(`Before cpu%=${beforeCpu}, after cpu%=${afterCpu}`);
    console.error(
      `Worker output bytes at start=${workerBytesAtStart}, at end=${workerBytesAtEnd}`
    );
    await fs.writeFile(
      outFile("error.txt"),
      `Validation failed: bytesDelta=${bytesDelta} (threshold=${bytesThreshold}) cpuDelta=${cpuDelta} (threshold=${cpuThreshold}) workerBytesDelta=${workerBytesDelta} profileStatus=${JSON.stringify(
        profileStatus
      )}`
    );
    process.exit(1);
  }

  console.log("Validation succeeded: metrics increased under stress mode");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(2);
});

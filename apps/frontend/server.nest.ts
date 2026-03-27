/* eslint-disable @typescript-eslint/no-explicit-any */
// tsconfig-paths registration happens during bootstrap when necessary
import { NestFactory } from "@nestjs/core";
import "@angular/compiler";
// explicit any usage in this bootstrap file is intentional (vite dev middleware, SSR bootstrap)
import {
  Module,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Injectable,
  All,
} from "@nestjs/common";
import { ExecutionPlansController } from "./src/app/controllers/execution-plans.controller";
import { RuntimeLoadProfileService } from "./src/app/services/runtime-load-profile.service";
import { ForgeProxyService } from "./src/server/forge/forge-proxy.service";
import {
  appendFrontendMetrics,
  classifyFrontendApiRoute,
  classifyFrontendRoute,
  recordFrontendApiMetrics,
  recordFrontendRequestMetrics,
} from "./src/server/metrics/frontend-metrics";
import { GovernanceUpstreamService } from "./src/server/governance/governance-upstream.service";
import { GovernanceProxyService } from "./src/server/governance/governance-proxy.service";
import { EmbeddedMockBackendService } from "./src/server/mock/embedded-mock-backend.service";

import express from "express";
import { createClient } from "redis";
import { CommonEngine } from "@angular/ssr/node";
import { join } from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { Request, Response } from "express";
import { Observable } from "rxjs";

type LoadProfilePct = 10 | 25 | 50 | 100;
type TopologyNode = {
  id: string;
  label: string;
  group: "app" | "infra" | "ngvla";
};
type TopologyLink = {
  source: string;
  target: string;
  value?: number;
};
type RuntimeProfileSpec = {
  workers: number;
  ratePerWorker: number;
  payloadSize: number;
  note: string;
};

const PROFILE_MAP: Record<LoadProfilePct, RuntimeProfileSpec> = {
  10: {
    workers: 0,
    ratePerWorker: 0,
    payloadSize: 512,
    note: "baseline (no extra runtime workers)",
  },
  25: {
    workers: 2,
    ratePerWorker: 500_000,
    payloadSize: 1024,
    note: "low stress",
  },
  50: {
    workers: 4,
    ratePerWorker: 1_500_000,
    payloadSize: 1024,
    note: "medium stress",
  },
  100: {
    workers: 8,
    ratePerWorker: 3_000_000,
    payloadSize: 2048,
    note: "smoke stress (bounded)",
  },
};

interface SsrOptions {
  browserDistFolder: string;
  indexHtmlPath: string;
  isDev: boolean;
  viteServer?: any;
  commonEngine: CommonEngine;
}

type RedisClientOps = {
  on(event: "error", listener: (err: unknown) => void): unknown;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
};

const REDIS_CACHE_DURATION_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2,
];
const GOVERNANCE_PROXY_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5,
];
const redisCacheRequestsTotal = { hit: 0, miss: 0, bypass: 0 };
const redisCacheBytesServedTotal = { hit: 0, miss: 0, bypass: 0 };
/**
 * The following Redis-related metrics are global totals rather than being broken down by dimensions like route or result type, since the SSR sample endpoint is just one and we want to keep the instrumentation simple. In a production scenario with more extensive Redis usage, these should be expanded to include dimensional breakdowns as needed.
 */
let redisCacheBytesWrittenTotal = 0;
let redisCacheReadErrorsTotal = 0;
let redisCacheWriteErrorsTotal = 0;
let redisClientConnected = 0;
/**
 * The following in-memory metrics stores are keyed by dimension combinations (e.g. route+method+status class) and hold cumulative counts/sums for Prometheus exposition. This is a simplified approach suitable for a dev/test environment; production telemetry should use a proper metrics library and export directly to a monitoring system.
 */
const governanceProxyRequestsTotal: Record<string, number> = {};
const governanceProxyResponseBytesTotal: Record<string, number> = {};
const governanceProxyDurationBucketCounts: Record<string, number[]> = {};
const governanceProxyDurationCount: Record<string, number> = {};
const governanceProxyDurationSum: Record<string, number> = {};
const prometheusProxyRequestsTotal: Record<string, number> = {};
const prometheusProxyResponseBytesTotal: Record<string, number> = {};
const prometheusProxyDurationBucketCounts: Record<string, number[]> = {};
const prometheusProxyDurationCount: Record<string, number> = {};
const prometheusProxyDurationSum: Record<string, number> = {};
// Runtime load profile metrics (exposed via /metrics so Prometheus can track stress load)
let runtimeLoadProfileMetrics: {
  profilePct: LoadProfilePct;
  workers: number;
  mode: string;
} = {
  profilePct: 10,
  workers: 0,
  mode: "baseline",
};

type TelemetrySsePayload = {
  ts: number;
  runtimeLoadProfile: {
    profilePct: LoadProfilePct;
    workers: number;
    mode: string;
    note: string;
  };
  workerBytesTotal: number;
  workerBytesPerSec: number;
};

const telemetrySseClients = new Set<Response>();
let lastWorkerBytes = 0;
let lastWorkerBytesAt = Date.now();

function sendSse(res: Response, event: string, data: unknown) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // ignore write failures
  }
}

const telemetryDebugEnabled = process.env["DEBUG_TELEMETRY"] === "true";
let lastTelemetryPayload: TelemetrySsePayload | null = null;
let telemetryLogWatcher: any = null;
let telemetryLogWatcherDebounce: NodeJS.Timeout | null = null;

function broadcastTelemetry(payload: TelemetrySsePayload) {
  lastTelemetryPayload = payload;
  if (telemetryDebugEnabled) {
    console.debug("telemetry: broadcasting", {
      ts: payload.ts,
      profilePct: payload.runtimeLoadProfile.profilePct,
      workers: payload.runtimeLoadProfile.workers,
      bytesPerSec: payload.workerBytesPerSec,
    });
  }

  for (const res of Array.from(telemetrySseClients)) {
    if (res.writableEnded || res.writableFinished) {
      telemetrySseClients.delete(res);
      continue;
    }
    sendSse(res, "telemetry", payload);
  }
}

function getTelemetryPayload(): TelemetrySsePayload {
  const now = Date.now();
  const workerBytesTotal = getRuntimeLoadWorkerBytes();
  const deltaBytes = workerBytesTotal - lastWorkerBytes;
  const deltaTimeSec = Math.max(0.001, (now - lastWorkerBytesAt) / 1000);
  const bytesPerSec = deltaBytes > 0 ? deltaBytes / deltaTimeSec : 0;
  lastWorkerBytes = workerBytesTotal;
  lastWorkerBytesAt = now;

  return {
    ts: now,
    runtimeLoadProfile: {
      ...runtimeLoadProfileMetrics,
      note: PROFILE_MAP[runtimeLoadProfileMetrics.profilePct]?.note ?? "",
    },
    workerBytesTotal,
    workerBytesPerSec: Math.round(bytesPerSec),
  };
}

function getRuntimeLoadWorkerFileStats():
  | Array<{ filename: string; size: number; mtimeMs: number }>
  | undefined {
  try {
    const fs = require("fs");
    const path = require("path");
    const logsDir = path.join(process.cwd(), "tools", "data-generator", "logs");
    const names = fs.readdirSync(logsDir);
    const workerFiles = names.filter((n: string) =>
      /^runtime-profile\.worker-\d+\.bin$/.test(n)
    );
    return workerFiles.map((filename: string) => {
      try {
        const st = fs.statSync(path.join(logsDir, filename));
        return {
          filename,
          size: st.size,
          mtimeMs: st.mtimeMs,
        };
      } catch {
        return { filename, size: 0, mtimeMs: 0 };
      }
    });
  } catch {
    return undefined;
  }
}

function getTelemetryDebugInfo() {
  return {
    lastPayload: lastTelemetryPayload,
    clientCount: telemetrySseClients.size,
    workerFiles: getRuntimeLoadWorkerFileStats(),
  };
}

function startTelemetryLogWatcher() {
  try {
    const fs = require("fs");
    const path = require("path");
    const logsDir = path.join(process.cwd(), "tools", "data-generator", "logs");
    if (!fs.existsSync(logsDir)) {
      return;
    }
    telemetryLogWatcher = fs.watch(logsDir, { persistent: false }, () => {
      if (telemetryLogWatcherDebounce) return;
      telemetryLogWatcherDebounce = setTimeout(() => {
        telemetryLogWatcherDebounce = null;
        broadcastTelemetry(getTelemetryPayload());
      }, 50);
    });
  } catch (e) {
    if (telemetryDebugEnabled) {
      console.warn("Failed to watch telemetry log dir:", e);
    }
  }
}

function stopTelemetryLogWatcher() {
  if (telemetryLogWatcher) {
    telemetryLogWatcher.close();
    telemetryLogWatcher = null;
  }
  if (telemetryLogWatcherDebounce) {
    clearTimeout(telemetryLogWatcherDebounce);
    telemetryLogWatcherDebounce = null;
  }
}

setInterval(() => {
  broadcastTelemetry(getTelemetryPayload());
}, 1000);

function updateRuntimeLoadProfileMetrics(status: {
  profilePct: LoadProfilePct;
  workers: number;
  mode: string;
}) {
  runtimeLoadProfileMetrics = { ...status };
}

function getRuntimeLoadWorkerBytes(): number {
  try {
    const fs = require("fs");
    const path = require("path");
    const logsDir = path.join(process.cwd(), "tools", "data-generator", "logs");
    const names = fs.readdirSync(logsDir);
    const workerFiles = names.filter((n: string) =>
      /^runtime-profile\.worker-\d+\.bin$/.test(n)
    );
    return workerFiles.reduce((sum: number, filename: string) => {
      try {
        const st = fs.statSync(path.join(logsDir, filename));
        return sum + st.size;
      } catch {
        return sum;
      }
    }, 0);
  } catch {
    return 0;
  }
}

const redisCacheDurationBucketCounts = new Array(
  REDIS_CACHE_DURATION_BUCKETS.length + 1
).fill(0);
let redisCacheDurationCount = 0;
let redisCacheDurationSum = 0;

function observeRedisCacheDuration(seconds: number): void {
  redisCacheDurationCount += 1;
  redisCacheDurationSum += seconds;
  const idx = REDIS_CACHE_DURATION_BUCKETS.findIndex(
    (bucket) => seconds <= bucket
  );
  redisCacheDurationBucketCounts[
    idx === -1 ? redisCacheDurationBucketCounts.length - 1 : idx
  ] += 1;
}

function governanceProxyKey(
  route: string,
  method: string,
  statusClass: string
): string {
  return `${route}|${method}|${statusClass}`;
}

function prometheusProxyKey(method: string, statusClass: string): string {
  return `${method}|${statusClass}`;
}

function observeGovernanceProxyDuration(
  route: string,
  method: string,
  statusClass: string,
  seconds: number
): void {
  const key = governanceProxyKey(route, method, statusClass);
  const buckets =
    governanceProxyDurationBucketCounts[key] ??
    new Array(GOVERNANCE_PROXY_DURATION_BUCKETS.length + 1).fill(0);
  governanceProxyDurationBucketCounts[key] = buckets;
  governanceProxyDurationCount[key] =
    (governanceProxyDurationCount[key] ?? 0) + 1;
  governanceProxyDurationSum[key] =
    (governanceProxyDurationSum[key] ?? 0) + seconds;
  const idx = GOVERNANCE_PROXY_DURATION_BUCKETS.findIndex(
    (bucket) => seconds <= bucket
  );
  buckets[idx === -1 ? buckets.length - 1 : idx] += 1;
}

function recordGovernanceProxyMetrics(
  route: string,
  method: string,
  status: number,
  responseBytes: number,
  durationSeconds: number
): void {
  const statusClass =
    status >= 500
      ? "5xx"
      : status >= 400
      ? "4xx"
      : status >= 300
      ? "3xx"
      : "2xx";
  const key = governanceProxyKey(route, method.toUpperCase(), statusClass);
  governanceProxyRequestsTotal[key] =
    (governanceProxyRequestsTotal[key] ?? 0) + 1;
  governanceProxyResponseBytesTotal[key] =
    (governanceProxyResponseBytesTotal[key] ?? 0) + Math.max(0, responseBytes);
  observeGovernanceProxyDuration(
    route,
    method.toUpperCase(),
    statusClass,
    durationSeconds
  );
}

function observePrometheusProxyDuration(
  method: string,
  statusClass: string,
  seconds: number
): void {
  const key = prometheusProxyKey(method, statusClass);
  const buckets =
    prometheusProxyDurationBucketCounts[key] ??
    new Array(GOVERNANCE_PROXY_DURATION_BUCKETS.length + 1).fill(0);
  prometheusProxyDurationBucketCounts[key] = buckets;
  prometheusProxyDurationCount[key] =
    (prometheusProxyDurationCount[key] ?? 0) + 1;
  prometheusProxyDurationSum[key] =
    (prometheusProxyDurationSum[key] ?? 0) + seconds;
  const idx = GOVERNANCE_PROXY_DURATION_BUCKETS.findIndex(
    (bucket) => seconds <= bucket
  );
  buckets[idx === -1 ? buckets.length - 1 : idx] += 1;
}

function recordPrometheusProxyMetrics(
  method: string,
  status: number,
  responseBytes: number,
  durationSeconds: number
): void {
  const statusClass =
    status >= 500
      ? "5xx"
      : status >= 400
      ? "4xx"
      : status >= 300
      ? "3xx"
      : "2xx";
  const key = prometheusProxyKey(method.toUpperCase(), statusClass);
  prometheusProxyRequestsTotal[key] =
    (prometheusProxyRequestsTotal[key] ?? 0) + 1;
  prometheusProxyResponseBytesTotal[key] =
    (prometheusProxyResponseBytesTotal[key] ?? 0) + Math.max(0, responseBytes);
  observePrometheusProxyDuration(
    method.toUpperCase(),
    statusClass,
    durationSeconds
  );
}

function renderPrometheusMetrics(): string {
  const lines: string[] = [];
  lines.push(
    "# HELP frontend_ssr_redis_client_connected Whether the Nest SSR Redis client is connected.",
    "# TYPE frontend_ssr_redis_client_connected gauge",
    `frontend_ssr_redis_client_connected ${redisClientConnected}`
  );

  lines.push(
    "# HELP frontend_ssr_redis_cache_requests_total Total Redis cache requests made by the Nest SSR VO sample endpoint.",
    "# TYPE frontend_ssr_redis_cache_requests_total counter"
  );
  for (const [result, value] of Object.entries(redisCacheRequestsTotal)) {
    lines.push(
      `frontend_ssr_redis_cache_requests_total{result="${result}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_redis_cache_bytes_served_total Total response bytes served by the Nest SSR VO sample endpoint.",
    "# TYPE frontend_ssr_redis_cache_bytes_served_total counter"
  );
  for (const [result, value] of Object.entries(redisCacheBytesServedTotal)) {
    lines.push(
      `frontend_ssr_redis_cache_bytes_served_total{result="${result}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_redis_cache_bytes_written_total Total bytes written into Redis by the Nest SSR VO sample endpoint.",
    "# TYPE frontend_ssr_redis_cache_bytes_written_total counter",
    `frontend_ssr_redis_cache_bytes_written_total ${redisCacheBytesWrittenTotal}`
  );

  lines.push(
    "# HELP frontend_ssr_redis_cache_errors_total Total Redis cache read/write errors seen by Nest SSR.",
    "# TYPE frontend_ssr_redis_cache_errors_total counter",
    `frontend_ssr_redis_cache_errors_total{operation="read"} ${redisCacheReadErrorsTotal}`,
    `frontend_ssr_redis_cache_errors_total{operation="write"} ${redisCacheWriteErrorsTotal}`
  );

  lines.push(
    "# HELP frontend_ssr_redis_cache_request_duration_seconds Request duration for the Nest SSR VO sample endpoint.",
    "# TYPE frontend_ssr_redis_cache_request_duration_seconds histogram"
  );
  let cumulative = 0;
  REDIS_CACHE_DURATION_BUCKETS.forEach((bucket, index) => {
    cumulative += redisCacheDurationBucketCounts[index];
    lines.push(
      `frontend_ssr_redis_cache_request_duration_seconds_bucket{le="${bucket}"} ${cumulative}`
    );
  });
  cumulative +=
    redisCacheDurationBucketCounts[redisCacheDurationBucketCounts.length - 1];
  lines.push(
    `frontend_ssr_redis_cache_request_duration_seconds_bucket{le="+Inf"} ${cumulative}`,
    `frontend_ssr_redis_cache_request_duration_seconds_sum ${redisCacheDurationSum}`,
    `frontend_ssr_redis_cache_request_duration_seconds_count ${redisCacheDurationCount}`
  );

  lines.push(
    "# HELP frontend_ssr_governance_proxy_requests_total Total requests proxied from Nest SSR to java-governance.",
    "# TYPE frontend_ssr_governance_proxy_requests_total counter"
  );
  for (const [key, value] of Object.entries(governanceProxyRequestsTotal)) {
    const [route, method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_governance_proxy_requests_total{route="${route}",method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_governance_proxy_response_bytes_total Total response bytes returned by java-governance through Nest SSR.",
    "# TYPE frontend_ssr_governance_proxy_response_bytes_total counter"
  );
  for (const [key, value] of Object.entries(
    governanceProxyResponseBytesTotal
  )) {
    const [route, method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_governance_proxy_response_bytes_total{route="${route}",method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_governance_proxy_request_duration_seconds Duration of requests proxied from Nest SSR to java-governance.",
    "# TYPE frontend_ssr_governance_proxy_request_duration_seconds histogram"
  );
  for (const key of Object.keys(governanceProxyDurationBucketCounts)) {
    const [route, method, statusClass] = key.split("|");
    const buckets = governanceProxyDurationBucketCounts[key];
    let bucketCumulative = 0;
    GOVERNANCE_PROXY_DURATION_BUCKETS.forEach((bucket, index) => {
      bucketCumulative += buckets[index] ?? 0;
      lines.push(
        `frontend_ssr_governance_proxy_request_duration_seconds_bucket{route="${route}",method="${method}",status_class="${statusClass}",le="${bucket}"} ${bucketCumulative}`
      );
    });
    bucketCumulative += buckets[buckets.length - 1] ?? 0;
    lines.push(
      `frontend_ssr_governance_proxy_request_duration_seconds_bucket{route="${route}",method="${method}",status_class="${statusClass}",le="+Inf"} ${bucketCumulative}`,
      `frontend_ssr_governance_proxy_request_duration_seconds_sum{route="${route}",method="${method}",status_class="${statusClass}"} ${
        governanceProxyDurationSum[key] ?? 0
      }`,
      `frontend_ssr_governance_proxy_request_duration_seconds_count{route="${route}",method="${method}",status_class="${statusClass}"} ${
        governanceProxyDurationCount[key] ?? 0
      }`
    );
  }

  lines.push(
    "# HELP frontend_ssr_prometheus_proxy_requests_total Total requests proxied from Nest SSR to Prometheus.",
    "# TYPE frontend_ssr_prometheus_proxy_requests_total counter"
  );
  for (const [key, value] of Object.entries(prometheusProxyRequestsTotal)) {
    const [method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_prometheus_proxy_requests_total{method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_prometheus_proxy_response_bytes_total Total response bytes returned by Prometheus through Nest SSR.",
    "# TYPE frontend_ssr_prometheus_proxy_response_bytes_total counter"
  );
  for (const [key, value] of Object.entries(
    prometheusProxyResponseBytesTotal
  )) {
    const [method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_prometheus_proxy_response_bytes_total{method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_prometheus_proxy_request_duration_seconds Duration of requests proxied from Nest SSR to Prometheus.",
    "# TYPE frontend_ssr_prometheus_proxy_request_duration_seconds histogram"
  );
  for (const key of Object.keys(prometheusProxyDurationBucketCounts)) {
    const [method, statusClass] = key.split("|");
    const buckets = prometheusProxyDurationBucketCounts[key];
    let bucketCumulative = 0;
    GOVERNANCE_PROXY_DURATION_BUCKETS.forEach((bucket, index) => {
      bucketCumulative += buckets[index] ?? 0;
      lines.push(
        `frontend_ssr_prometheus_proxy_request_duration_seconds_bucket{method="${method}",status_class="${statusClass}",le="${bucket}"} ${bucketCumulative}`
      );
    });
    bucketCumulative += buckets[buckets.length - 1] ?? 0;
    lines.push(
      `frontend_ssr_prometheus_proxy_request_duration_seconds_bucket{method="${method}",status_class="${statusClass}",le="+Inf"} ${bucketCumulative}`,
      `frontend_ssr_prometheus_proxy_request_duration_seconds_sum{method="${method}",status_class="${statusClass}"} ${
        prometheusProxyDurationSum[key] ?? 0
      }`,
      `frontend_ssr_prometheus_proxy_request_duration_seconds_count{method="${method}",status_class="${statusClass}"} ${
        prometheusProxyDurationCount[key] ?? 0
      }`
    );
  }

  // Runtime load profile metrics (stress mode workers + bytes written)
  lines.push(
    "# HELP frontend_ssr_runtime_load_profile_pct Current runtime load profile percentage.",
    "# TYPE frontend_ssr_runtime_load_profile_pct gauge",
    `frontend_ssr_runtime_load_profile_pct ${runtimeLoadProfileMetrics.profilePct}`
  );
  lines.push(
    "# HELP frontend_ssr_runtime_load_profile_workers Number of active runtime load worker processes.",
    "# TYPE frontend_ssr_runtime_load_profile_workers gauge",
    `frontend_ssr_runtime_load_profile_workers ${runtimeLoadProfileMetrics.workers}`
  );
  lines.push(
    "# HELP frontend_ssr_runtime_load_profile_mode Runtime load profile mode (baseline/runtime-controlled).",
    "# TYPE frontend_ssr_runtime_load_profile_mode gauge",
    `frontend_ssr_runtime_load_profile_mode{mode="${runtimeLoadProfileMetrics.mode}"} 1`
  );
  const runtimeWorkerBytes = getRuntimeLoadWorkerBytes();
  lines.push(
    "# HELP frontend_ssr_runtime_load_worker_bytes_total Total bytes written by runtime load worker processes (aggregated).",
    "# TYPE frontend_ssr_runtime_load_worker_bytes_total gauge",
    `frontend_ssr_runtime_load_worker_bytes_total ${runtimeWorkerBytes}`
  );

  appendFrontendMetrics(lines);

  return lines.join("\n") + "\n";
}

// Redis client singleton (optional)
let redisClient: RedisClientOps | null = null;
const VO_CACHED_SAMPLES_KEY = "frontend:ssr:vo-cached-samples:v1";
const VO_CACHED_SAMPLES_TTL_SECONDS = 300;

function voCachedSamplesPayload(): Record<string, Record<string, unknown>> {
  return {
    "vo.cone-search": {
      provider: "SIMBAD",
      serviceUrl: "https://simbad.cds.unistra.fr/simbad/sim-tap/sync",
      target: "M42",
      ra: 83.8221,
      dec: -5.3911,
      radius: 0.5,
      format: "votable",
      liveMode: true,
      _description: "Cone search around Orion Nebula (M42), radius 0.5\u00b0",
    },
    "vo.adql.query": {
      provider: "HEASARC",
      tapUrl: "https://heasarc.gsfc.nasa.gov/xamin/tap/sync",
      adql: "SELECT TOP 10 target_name, ra, dec, exposure FROM chanmaster ORDER BY exposure DESC",
      limit: 10,
      liveMode: true,
      _description: "Top 10 longest Chandra observations (HEASARC TAP)",
    },
    "vo.obscore.search": {
      provider: "ESO",
      tapUrl: "https://archive.eso.org/tap_obs/sync",
      dataproductType: "image",
      spatialBoundsRa: 187.277915,
      spatialBoundsDec: 2.052389,
      spatialBoundsRadius: 0.5,
      limit: 20,
      liveMode: true,
      _description:
        "ESO ObsCore image search around quasar 3C 273 (r=0.5\u00b0)",
    },
    "vo.votable.fetch": {
      provider: "HEASARC",
      votableUrl:
        "https://heasarc.gsfc.nasa.gov/xamin/query?table=chanmaster&position=3c273&format=votable",
      format: "votable",
      liveMode: true,
      _description: "Chandra observations of quasar 3C 273 as VOTable",
    },
    "vo.datalink.resolve": {
      provider: "CADC",
      datalinkUrl:
        "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/datalink",
      datasetIdentifier: "ivo://cadc.nrc.ca/CFHT?2459817",
      liveMode: true,
      _description: "DataLink products for CFHT MegaCam observation 2459817",
    },
    "vo.product.fetch": {
      provider: "HEASARC",
      productUrl:
        "https://heasarc.gsfc.nasa.gov/FTP/chandra/data/byobsid/2/21843/primary/acisf21843N002_evt2.fits.gz",
      expectedMimeType: "application/fits",
      liveMode: true,
      _description:
        "Chandra ACIS event file \u2014 Cas A supernova remnant (obs 21843)",
    },
    "vo.soda.cutout": {
      provider: "CADC",
      sodaUrl: "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/soda",
      datasetIdentifier: "ivo://cadc.nrc.ca/CFHT?2459817",
      spatialBoundsRa: 187.277915,
      spatialBoundsDec: 2.052389,
      spatialBoundsRadius: 0.1,
      outputFormat: "fits",
      liveMode: true,
      _description:
        "CADC SODA cutout centered on 3C 273 (r=0.1\u00b0, CFHT obs 2459817)",
    },
    "vo.preview.fetch": {
      provider: "ESASky",
      previewUrl:
        "https://sky.esa.int/esasky-tap/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=votable&QUERY=SELECT+TOP+5+*+FROM+mv_xsa_obs+WHERE+target_name+LIKE+%2527%2525Crab%2525%2527",
      liveMode: true,
      _description:
        "ESASky XMM-Newton observations matching 'Crab' target (top 5)",
    },
  };
}

async function initRedisClient() {
  if (process.env["DISABLE_REDIS_CLIENT"] === "true") {
    console.log("Redis client disabled by environment");
    redisClient = null;
    return;
  }

  const url =
    process.env["REDIS_URL"] ||
    process.env["REDIS_URI"] ||
    "redis://127.0.0.1:6379";
  try {
    const c = createClient({ url }) as unknown as RedisClientOps;
    c.on("error", (err: unknown) => {
      redisClientConnected = 0;
      console.warn("Redis client error:", err);
    });
    await c.connect();
    redisClient = c;
    redisClientConnected = 1;
    console.log("Connected to Redis at", url);
  } catch (e) {
    // Not fatal — Redis is optional for caching
    console.warn("Could not initialize Redis client:", e);
    redisClient = null;
    redisClientConnected = 0;
  }
}

@Injectable()
class SsrService {
  options: SsrOptions;

  constructor() {
    // initialize synchronously; further initialization happens in init()
    const serverDistFolder = join(
      process.cwd(),
      "dist",
      "apps",
      "frontend",
      "server"
    );
    const browserDistFolder = join(
      process.cwd(),
      "dist",
      "apps",
      "frontend",
      "browser"
    );
    const indexServerHtml = join(serverDistFolder, "index.server.html");
    const indexHtmlPath = existsSync(indexServerHtml)
      ? indexServerHtml
      : join(process.cwd(), "apps", "frontend", "src", "index.html");

    this.options = {
      browserDistFolder,
      indexHtmlPath,
      isDev: process.env["NODE_ENV"] !== "production",
      commonEngine: new CommonEngine(),
    } as SsrOptions;
  }

  async init(viteServer?: any) {
    this.options.viteServer = viteServer;
  }

  getPublicEnv() {
    const allowed = [
      "NODE_ENV",
      "PORT",
      "FRONTEND_PORT",
      "MINIO_ROOT_USER",
      "PNPM_STORE_DIR",
      "KAFKA_BROKER",
      "RABBITMQ_URL",
    ];
    const out: Record<string, string> = {};
    allowed.forEach((k) => {
      if (process.env[k] !== undefined) out[k] = process.env[k] as string;
    });
    return out;
  }

  getSecrets() {
    const secrets = ["MINIO_ROOT_PASSWORD"];
    const out: Record<string, string> = {};
    secrets.forEach((k) => {
      if (process.env[k] !== undefined) out[k] = process.env[k] as string;
    });
    return out;
  }

  async render(req: Request, res: Response) {
    const { isDev, viteServer, commonEngine, browserDistFolder } = this.options;
    const protocol = req.protocol;
    const originalUrl = req.originalUrl;

    if (!isDev || !viteServer) {
      // production SSR
      return commonEngine
        .render({
          bootstrap: undefined as any, // will use packaged server bundle in production
          documentFilePath: this.options.indexHtmlPath,
          url: `${protocol}://${req.headers.host}${originalUrl}`,
          publicPath: browserDistFolder,
          providers: [],
        })
        .then((html: string) => res.send(html))
        .catch((err: any) => {
          console.error("SSR render error:", err);
          res
            .status(500)
            .send(`<pre>${(err && err.stack) || String(err)}</pre>`);
        });
    }

    try {
      const indexHtmlRaw = readFileSync(
        join(process.cwd(), "apps", "frontend", "src", "index.html"),
        "utf8"
      );
      let transformed = await viteServer.transformIndexHtml(
        req.originalUrl,
        indexHtmlRaw
      );
      const tmpDir = join(process.cwd(), ".angular", "dev_ssr");
      try {
        mkdirSync(tmpDir, { recursive: true });
      } catch {
        void 0;
      }
      const tmpIndex = join(tmpDir, "index.server.html");
      // Ensure the transformed index contains a doctype and an <app-root> element
      try {
        if (!/<!doctype/i.test(transformed)) {
          transformed = "<!DOCTYPE html>\n" + transformed;
        }
        if (!/<app-root\b/i.test(transformed)) {
          transformed = transformed.replace(
            /<\/body>/i,
            "  <app-root></app-root>\n</body>"
          );
        }
      } catch (e) {
        console.warn("Failed to normalize transformed index for SSR:", e);
      }

      writeFileSync(tmpIndex, transformed, "utf8");

      const mod = await viteServer.ssrLoadModule(
        "/apps/frontend/src/main.server.ts"
      );
      const bootstrapFn = (mod && (mod.default || mod.bootstrap)) as any;
      try {
        // Debug: log which index file and a small snippet so we can confirm the document
        try {
          const tmpHtml = readFileSync(tmpIndex, "utf8");
          console.log("Dev SSR using documentFilePath:", tmpIndex);
          console.log("Dev SSR document length:", tmpHtml.length);
          console.log(
            "Dev SSR document snippet:",
            tmpHtml.slice(0, 200).replace(/\n/g, " ")
          );
        } catch (e) {
          console.warn("Could not read tmpIndex for debug logging:", e);
        }

        return commonEngine
          .render({
            bootstrap: bootstrapFn,
            documentFilePath: tmpIndex,
            url: `${protocol}://${req.headers.host}${originalUrl}`,
            publicPath: browserDistFolder,
            providers: [],
          })
          .then((html: string) => res.send(html))
          .catch((err: any) => {
            console.error("Dev SSR render error:", err);
            res
              .status(500)
              .send(`<pre>${(err && err.stack) || String(err)}</pre>`);
          });
      } catch (e) {
        console.error("Dev SSR pipeline error before render:", e);
        res.status(500).send(`<pre>${String(e)}</pre>`);
      }
    } catch (e) {
      console.error("Dev SSR pipeline error:", e);
      res.setHeader("Content-Type", "text/html");
      res.send(
        readFileSync(
          join(process.cwd(), "apps", "frontend", "src", "index.html"),
          "utf8"
        )
      );
    }
  }
}

@Controller()
export class AppController {
  constructor(
    private ssr: SsrService,
    private runtimeLoad: RuntimeLoadProfileService | undefined,
    private readonly forgeProxyService: ForgeProxyService = new ForgeProxyService(),
    private readonly governanceUpstreamService: GovernanceUpstreamService = new GovernanceUpstreamService(),
    private readonly governanceProxyService: GovernanceProxyService = new GovernanceProxyService(
      governanceUpstreamService
    ),
    private readonly embeddedMockBackendService: EmbeddedMockBackendService = new EmbeddedMockBackendService()
  ) {
    // In some development setups the runtime load service may not be provided via DI.
    // Fall back to an explicit instance so stress profile endpoints still work.
    if (!this.runtimeLoad) {
      this.runtimeLoad = new RuntimeLoadProfileService();
    }
  }

  @Get("api/telemetry/stream")
  streamTelemetry(@Req() req: Request, @Res() res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Initial ping to establish the connection
    sendSse(res, "connected", { ts: Date.now() });
    telemetrySseClients.add(res);

    // Send an initial snapshot immediately
    sendSse(res, "telemetry", getTelemetryPayload());

    req.on("close", () => {
      telemetrySseClients.delete(res);
    });
  }

  @Get("api/telemetry/debug")
  telemetryDebug() {
    return getTelemetryDebugInfo();
  }

  private embeddedPrometheusPayload(
    query: string,
    start?: number,
    end?: number,
    step?: number
  ) {
    // Provide mock Prometheus output for both instant and range queries.
    const nowSec = Math.floor(Date.now() / 1000);

    const baseValue = (): number => {
      if (
        query.includes("sum(up)") ||
        query.includes('up{job="data-generator"}')
      )
        return Math.random() > 0.97 ? 0 : 1;
      if (query.includes("generator_bytes_produced_total"))
        return 524288 + Math.round((nowSec % 60) * 1024);
      if (query.includes("generator_records_produced_total"))
        return 120 + Math.round((nowSec % 60) * 4);
      if (query.includes("process_cpu_seconds_total"))
        return 17.5 + Math.sin(nowSec / 30) * 3;
      return 1 + Math.sin(nowSec / 10);
    };

    const instantValue = baseValue();

    // Range query: return a matrix-style response with values over time
    if (start !== undefined && end !== undefined && step !== undefined) {
      const safeStep = Math.max(1, step);
      const points: Array<[number, string]> = [];
      for (let t = start; t <= end; t += safeStep) {
        const wind = (t % 60) / 60;
        const value = baseValue() * (0.8 + 0.4 * Math.sin(wind * Math.PI * 2));
        points.push([t, value.toFixed(2)]);
      }
      return {
        status: "success",
        data: {
          resultType: "matrix",
          result: [
            {
              metric: {},
              values: points,
            },
          ],
        },
      };
    }

    return {
      status: "success",
      data: {
        resultType: "vector",
        result: [
          {
            metric: {},
            value: [nowSec, String(instantValue)],
          },
        ],
      },
    };
  }

  private fallbackTopologyMetrics() {
    const topology = this.topologyPayload();
    const links: Record<
      string,
      {
        currentMBps: number;
        maxMBps: number;
        latencyMs: number;
        errorRatePct: number;
        confidencePct: number;
        source: "admin" | "derived";
      }
    > = Object.fromEntries(
      topology.links.map((link, index) => {
        const source = String(link.source);
        const target = String(link.target);
        const channels = Number(link.value ?? 1) || 1;
        const maxMBps = channels * 1250;
        const currentMBps = Number(
          (maxMBps * (0.18 + ((index % 5) * 0.11 + channels * 0.03))).toFixed(2)
        );
        const provenance =
          source === "prom" ||
          target === "prom" ||
          source === "grafana" ||
          target === "grafana" ||
          source === "alertmanager" ||
          target === "alertmanager" ||
          source === "redis" ||
          target === "redis" ||
          source === "rabbitmq" ||
          target === "rabbitmq" ||
          source === "pulsar" ||
          target === "pulsar" ||
          source === "kafka" ||
          target === "kafka"
            ? "admin"
            : "derived";

        return [
          `${source}->${target}`,
          {
            currentMBps,
            maxMBps,
            latencyMs: 8 + channels * 3,
            errorRatePct: Number((channels * 0.02).toFixed(2)),
            confidencePct: provenance === "admin" ? 92 : 74,
            source: provenance,
          },
        ];
      })
    );

    return {
      links,
      timing_drift_ns: 0,
      rfi_event_rate: 0,
      diagnostics: {
        structuralDerivedLinkCount: Object.values(links).filter(
          (entry) => entry.source === "derived"
        ).length,
        fallbackDerivedLinkCount: 0,
      },
    };
  }

  private mockInfrastructureTelemetry() {
    return {
      measuredAt: new Date().toISOString(),
      source: "mock",
      services: {
        redis: {
          source: "mock",
          opsPerSec: 42,
          ingressBytesPerSec: 4096,
          egressBytesPerSec: 6144,
          connectedClients: 3,
          memoryUsedBytes: 1572864,
        },
        rabbitmq: {
          source: "mock",
          queueDepth: 8,
          readyMessages: 5,
          unackedMessages: 3,
          publishRatePerSec: 6,
          deliverRatePerSec: 5,
          consumers: 2,
        },
        minio: {
          source: "mock",
          ingressBytesPerSec: 1048576,
          egressBytesPerSec: 524288,
          requestsPerSec: 12,
          errorRatePerSec: 0,
        },
        nginx: {
          source: "mock",
          requestsPerSec: 6.2,
          ingressBytesPerSec: 4096,
          egressBytesPerSec: 98304,
          errorRatePerSec: 0.02,
          avgLatencyMs: 9,
        },
        frontendSsr: {
          source: "mock",
          connectedClients: 1,
          hitRatePerSec: 1.2,
          missRatePerSec: 0.15,
          bypassRatePerSec: 0,
          ingressBytesPerSec: 512,
          egressBytesPerSec: 3072,
          errorRatePerSec: 0,
          avgLatencyMs: 4.5,
          governanceProxyRatePerSec: 2.4,
          governanceProxyBytesPerSec: 24576,
          governanceProxyErrorRatePerSec: 0.02,
          governanceProxyLatencyMs: 28,
          prometheusProxyRatePerSec: 3.1,
          prometheusProxyBytesPerSec: 131072,
          prometheusProxyErrorRatePerSec: 0,
          prometheusProxyLatencyMs: 22,
          frontendRequestRatePerSec: 4.8,
          frontendResponseBytesPerSec: 65536,
          frontendErrorRatePerSec: 0.01,
          frontendRequestLatencyMs: 16,
          frontendApiRequestRatePerSec: 7.4,
          frontendApiResponseBytesPerSec: 49152,
          frontendApiErrorRatePerSec: 0.03,
          frontendApiLatencyMs: 21,
          routeRequestRatesPerSec: {
            dashboard: 1.2,
            telemetry: 1.6,
            topology: 0.8,
            jobs: 0.7,
            diagnostics: 0.3,
            settings: 0.2,
          },
          apiRouteRequestRatesPerSec: {
            telemetry: 1.7,
            jobs: 2.1,
            vo: 1.3,
            alerts: 0.9,
            rabbitmq: 0.6,
            pulsar: 0.5,
            admin: 0.3,
          },
        },
        kafka: {
          source: "mock",
          brokers: 1,
          topics: 4,
          consumerLag: 12,
          ingressBytesPerSec: 7340032,
          egressBytesPerSec: 6291456,
        },
        javaIngest: {
          source: "prometheus",
          receiveRatePerSec: 6.2,
          processedRatePerSec: 6.1,
          validationFailureRatePerSec: 0.08,
          failureRatePerSec: 0.02,
          retryRatePerSec: 0,
          dlqRatePerSec: 0,
          payloadBytesPerSec: 5242880,
          avgLatencyMs: 14,
        },
        pulsar: {
          source: "prometheus",
          status: "healthy",
          brokers: 1,
          topics: 6,
          partitions: 24,
          ingressBytesPerSec: 4194304,
          egressBytesPerSec: 3670016,
          publishRatePerSec: 18,
          deliverRatePerSec: 16,
        },
        grafana: {
          source: "prometheus",
          requestsPerSec: 1.1,
          errorRatePerSec: 0.01,
          avgLatencyMs: 12,
          dataproxyRatePerSec: 0.4,
          dataproxyLatencyMs: 24,
          datasources: 3,
          activeAlerts: 0,
        },
        loki: {
          source: "prometheus",
          requestsPerSec: 0.8,
          ingressBytesPerSec: 2048,
          egressBytesPerSec: 16384,
          errorRatePerSec: 0,
          avgLatencyMs: 18,
          inflightRequests: 1,
        },
        alertmanager: {
          source: "prometheus",
          requestsPerSec: 0.2,
          egressBytesPerSec: 4096,
          errorRatePerSec: 0,
          avgLatencyMs: 11,
          alertsReceivedRatePerSec: 0.05,
          activeAlerts: 0,
        },
        governanceRuntime: {
          source: "prometheus",
          submissionRatePerSec: 2.4,
          dispatchRatePerSec: 2.1,
          transitionRatePerSec: 3.2,
          completedTotal: 42,
          failedTotal: 3,
          completedRatePerSec: 1.9,
          failedRatePerSec: 0.2,
          artifactRatePerSec: 0.6,
          artifactPayloadBytesPerSec: 24576,
          kafkaPublishRatePerSec: 2.1,
          kafkaPublishBytesPerSec: 12288,
          kafkaPublishLatencyMs: 16,
          kafkaPublishErrorRatePerSec: 0.01,
          artifactReadRatePerSec: 0.48,
          artifactReadBytesPerSec: 12288,
          artifactReadAvgLatencyMs: 14,
          artifactReadErrorRatePerSec: 0.01,
          artifactAvgSizeBytes: 4096,
          rabbitmqPublishRatePerSec: 2.8,
          rabbitmqPublishBytesPerSec: 16384,
          redisReadRatePerSec: 11.5,
          redisWriteRatePerSec: 8.4,
          redisReadBytesPerSec: 32768,
          redisWriteBytesPerSec: 24576,
          redisAvgLatencyMs: 3.6,
          redisErrorRatePct: 0.08,
          objectWriteRatePerSec: 0.9,
          objectWriteBytesPerSec: 12288,
          minioObjectWriteRatePerSec: 0.35,
          minioObjectWriteBytesPerSec: 8192,
          minioObjectWriteAvgLatencyMs: 24.5,
          minioObjectWriteErrorRatePct: 0.15,
          localObjectWriteRatePerSec: 0.55,
          localObjectWriteBytesPerSec: 4096,
          kafkaIngestReceiveRatePerSec: 1.7,
          kafkaIngestSuccessRatePerSec: 1.6,
          kafkaIngestValidationFailureRatePerSec: 0.05,
          kafkaIngestDlqRatePerSec: 0.03,
          kafkaIngestFailureRatePerSec: 0.08,
          kafkaIngestPayloadBytesPerSec: 8192,
          kafkaIngestValidationReasonRatesPerSec: {
            datasetId: 0.03,
            workflow: 0.02,
          },
          kafkaIngestDuplicateReasonRatesPerSec: {
            request_id: 0.01,
          },
          rabbitIngestReceiveRatePerSec: 0.9,
          rabbitIngestSuccessRatePerSec: 0.88,
          rabbitIngestValidationFailureRatePerSec: 0.01,
          rabbitIngestDlqRatePerSec: 0.01,
          rabbitIngestFailureRatePerSec: 0.02,
          rabbitIngestPayloadBytesPerSec: 4096,
          rabbitIngestValidationReasonRatesPerSec: {
            payload: 0.01,
          },
          rabbitIngestDuplicateReasonRatesPerSec: {
            request_id: 0.01,
          },
          pulsarIngestReceiveRatePerSec: 0.6,
          pulsarIngestSuccessRatePerSec: 0.58,
          pulsarIngestValidationFailureRatePerSec: 0.01,
          pulsarIngestDlqRatePerSec: 0.01,
          pulsarIngestFailureRatePerSec: 0.02,
          pulsarIngestPayloadBytesPerSec: 3072,
          pulsarIngestValidationReasonRatesPerSec: {
            workflow: 0.01,
          },
          pulsarIngestDuplicateReasonRatesPerSec: {
            request_id: 0.01,
          },
          datasetMutationRatePerSec: 0.4,
          datasetMutationPayloadBytesPerSec: 4096,
          jobMetadataMutationRatePerSec: 0.7,
          jobMetadataMutationPayloadBytesPerSec: 6144,
          datasetPublishRatePerSec: 0.22,
          datasetPublishPayloadBytesPerSec: 3072,
          datasetReadRatePerSec: 0.71,
          datasetReadPayloadBytesPerSec: 5120,
          manifestPublishRatePerSec: 0.18,
          manifestPublishPayloadBytesPerSec: 2048,
          manifestReadRatePerSec: 0.46,
          manifestReadPayloadBytesPerSec: 2560,
          operatorReadRatePerSec: 2.2,
          operatorReadBytesPerSec: 12288,
          operatorReadRouteRatesPerSec: {
            jobs: 1.4,
            datasets: 0.5,
            alerts: 0.2,
            archive: 0.1,
          },
          httpRequestRatePerSec: 4.6,
          httpResponseBytesPerSec: 32768,
          httpErrorRatePerSec: 0.05,
          httpLatencyMs: 18.4,
          httpRouteRequestRatesPerSec: {
            jobs: 1.5,
            telemetry: 0.9,
            datasets: 0.8,
            alerts: 0.4,
            vo: 0.6,
            admin: 0.2,
          },
          voAdapterRequestRatePerSec: 0.44,
          voAdapterPayloadBytesPerSec: 3584,
          voAdapterLatencyMs: 412,
          voAdapterErrorRatePerSec: 0.03,
          voAdapterFailureClassRatesPerSec: {
            http_5xx: 0.02,
            timeout: 0.01,
          },
          voAdapterOperationRatesPerSec: {
            adql_query: 0.22,
            obscore_search: 0.12,
            votable_fetch: 0.1,
          },
          taccAdapterRequestRatePerSec: 0.31,
          taccAdapterPayloadBytesPerSec: 1280,
          taccAdapterLatencyMs: 185,
          taccAdapterErrorRatePerSec: 0,
          taccAdapterFailureClassRatesPerSec: {},
          taccAdapterOperationRatesPerSec: {
            submit: 0.31,
          },
          alertIngestedTotal: 18,
          alertIngestRatePerSec: 0.12,
          alertReplaysTotal: 3,
          alertReplayRatePerSec: 0.01,
          alertDlqDepth: 2,
          alertReplaySingleSuccessRatePerSec: 0.01,
          alertReplaySingleMissRatePerSec: 0,
          alertReplayAllSuccessRatePerSec: 0.002,
          alertReplayAllEmptyRatePerSec: 0.001,
          alertReplayItemsRatePerSec: 0.04,
          alertReplayAvgBatchSize: 2.5,
          alertReplayAvgLatencyMs: 18,
          queuedJobs: 9,
          runningJobs: 3,
          deferredJobs: 4,
          blockedJobs: 1,
          avgQueueAgeMs: 780,
          maxQueueAgeMs: 2150,
          scannerIntervalSeconds: 10,
          deferredReleaseRatePerSec: 0.03,
          deferredReleaseTotal: 7,
          restoreDrillRatePerSec: 0.02,
          restoreDrillSuccessRatePerSec: 0.02,
          restoreDrillFailureRatePerSec: 0,
          avgRestoreDrillLatencyMs: 840,
          avgCompletionLatencyMs: 1840,
          avgFailureLatencyMs: 5120,
          workflowOutcomes: {
            ingest: {
              source: "prometheus",
              completedTotal: 18,
              failedTotal: 2,
              completedRatePerSec: 0.8,
              failedRatePerSec: 0.07,
              avgDispatchWaitMs: 340,
              avgRuntimeMs: 2210,
            },
            "vo.adql.query": {
              source: "prometheus",
              completedTotal: 11,
              failedTotal: 1,
              completedRatePerSec: 0.44,
              failedRatePerSec: 0.02,
              avgDispatchWaitMs: 180,
              avgRuntimeMs: 1460,
            },
            "simulate.visibility": {
              source: "prometheus",
              completedTotal: 13,
              failedTotal: 0,
              completedRatePerSec: 0.61,
              failedRatePerSec: 0,
              avgDispatchWaitMs: 90,
              avgRuntimeMs: 920,
            },
          },
          executors: {
            simulator: {
              source: "prometheus",
              dispatchRatePerSec: 0.8,
              completedTotal: 22,
              failedTotal: 2,
              completedRatePerSec: 0.6,
              failedRatePerSec: 0.05,
              objectWriteRatePerSec: 0.3,
              objectWriteBytesPerSec: 4096,
              avgCompletionLatencyMs: 920,
            },
            vo: {
              source: "prometheus",
              dispatchRatePerSec: 0.5,
              completedTotal: 11,
              failedTotal: 1,
              completedRatePerSec: 0.4,
              failedRatePerSec: 0.02,
              objectWriteRatePerSec: 0.2,
              objectWriteBytesPerSec: 2048,
              avgCompletionLatencyMs: 1460,
            },
            tacc: {
              source: "prometheus",
              dispatchRatePerSec: 0.8,
              completedTotal: 9,
              failedTotal: 0,
              completedRatePerSec: 0.7,
              failedRatePerSec: 0,
              objectWriteRatePerSec: 0.4,
              objectWriteBytesPerSec: 6144,
              avgCompletionLatencyMs: 4180,
            },
          },
        },
      },
    };
  }

  private topologyPayload(): { nodes: TopologyNode[]; links: TopologyLink[] } {
    return {
      nodes: [
        { id: "backend", label: "Nest SSR", group: "app" },
        { id: "frontend", label: "Angular Frontend", group: "app" },
        { id: "java-governance", label: "Java Governance", group: "app" },
        { id: "java-ingest", label: "Java Ingest", group: "app" },
        { id: "data-generator", label: "Data Generator", group: "app" },
        { id: "kafka", label: "Kafka", group: "infra" },
        { id: "pulsar", label: "Pulsar", group: "infra" },
        { id: "rabbitmq", label: "RabbitMQ", group: "infra" },
        { id: "redis", label: "Redis", group: "infra" },
        { id: "minio", label: "MinIO", group: "infra" },
        { id: "prom", label: "Prometheus", group: "infra" },
        { id: "grafana", label: "Grafana", group: "infra" },
        { id: "loki", label: "Loki", group: "infra" },
        { id: "alertmanager", label: "Alertmanager", group: "infra" },
        { id: "nginx", label: "NGINX (static)", group: "infra" },
        { id: "zookeeper", label: "Zookeeper", group: "infra" },
        { id: "array-main", label: "Main Array (214 x 18m)", group: "ngvla" },
        { id: "array-lbl", label: "Long Baseline (19 x 6m)", group: "ngvla" },
        { id: "array-sba", label: "SBA (19 x 18m)", group: "ngvla" },
      ],
      links: [
        { source: "frontend", target: "backend" },
        { source: "frontend", target: "nginx" },
        { source: "backend", target: "java-governance" },
        { source: "backend", target: "redis" },
        { source: "backend", target: "prom" },
        { source: "data-generator", target: "pulsar" },
        { source: "data-generator", target: "kafka" },
        { source: "data-generator", target: "array-main" },
        { source: "data-generator", target: "array-lbl" },
        { source: "data-generator", target: "array-sba" },
        { source: "pulsar", target: "kafka" },
        { source: "pulsar", target: "java-governance" },
        { source: "zookeeper", target: "kafka" },
        { source: "rabbitmq", target: "java-governance" },
        { source: "kafka", target: "java-governance" },
        { source: "java-governance", target: "rabbitmq" },
        { source: "java-governance", target: "kafka" },
        { source: "java-governance", target: "minio" },
        { source: "java-governance", target: "redis" },
        { source: "kafka", target: "java-ingest" },
        { source: "prom", target: "grafana" },
        { source: "prom", target: "alertmanager" },
        { source: "loki", target: "grafana" },
        { source: "array-main", target: "minio", value: 3 },
        { source: "array-lbl", target: "minio", value: 2 },
        { source: "array-sba", target: "minio", value: 2 },
      ],
    };
  }

  @Get("/api/env")
  getEnv() {
    return this.ssr.getPublicEnv();
  }

  @Get("/metrics")
  metrics(@Res() res: Response): void {
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(renderPrometheusMetrics());
  }

  @Get("/api/topology")
  getTopology() {
    return this.topologyPayload();
  }

  @Get("/api/metrics/topology")
  async proxyTopologyMetrics(@Res() res: Response): Promise<void> {
    if (this.embeddedMockBackendService.useEmbeddedE2eBackend()) {
      res.status(200).json(this.embeddedMockBackendService.embeddedTopologyMetrics());
      return;
    }

    const targetUrls = this.governanceUpstreamService.governanceBaseCandidates().map(
      (b) => `${b}/api/v1/metrics/topology`
    );
    try {
      const started = Date.now();
      const upstream = await this.governanceUpstreamService.fetchWithFallback(
        targetUrls,
        { method: "GET" },
        7000
      );
      const text = await upstream.text();
      if (!upstream.ok) {
        console.warn(
          `Topology metrics upstream returned ${upstream.status}; serving fallback payload instead.`
        );
        res.setHeader("x-topology-fallback", String(upstream.status));
        res.status(200).json(this.fallbackTopologyMetrics());
        return;
      }
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("content-type", ct);
      recordGovernanceProxyMetrics(
        "topology_metrics",
        "GET",
        upstream.status,
        Buffer.byteLength(text ?? "", "utf8"),
        (Date.now() - started) / 1000
      );
      res.status(upstream.status).send(text);
    } catch (e: any) {
      console.error("Error proxying topology metrics:", e);
      res.setHeader("x-topology-fallback", "fetch-error");
      res.status(200).json(this.fallbackTopologyMetrics());
    }
  }

  @Get("/api/v1/visualization/metrics")
  async proxyVisualizationMetrics(@Res() res: Response): Promise<void> {
    if (this.embeddedMockBackendService.useEmbeddedE2eBackend()) {
      const now = Date.now();
      const sparkline = Array.from({ length: 40 }, (_, i) => ({
        t: now - (40 - i) * 1000,
        v: 20 + Math.random() * 60,
      }));
      res.status(200).json({
        source: "embedded",
        data: {
          throughput: 240.7,
          errorRate: 1.14,
          queueDepth: 45,
          sparkline,
          queueSeries: sparkline,
          histogram: [2, 5, 8, 12, 9, 6, 3],
          scatter: Array.from({ length: 20 }, () => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
          })),
        },
      });
      return;
    }

    const targetUrls = this.governanceUpstreamService.governanceBaseCandidates().map(
      (b) => `${b}/api/v1/visualization/metrics`
    );
    try {
      const started = Date.now();
      const upstream = await this.governanceUpstreamService.fetchWithFallback(
        targetUrls,
        { method: "GET" },
        7000
      );
      const text = await upstream.text();
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("content-type", ct);
      recordGovernanceProxyMetrics(
        "visualization_metrics",
        "GET",
        upstream.status,
        Buffer.byteLength(text ?? "", "utf8"),
        (Date.now() - started) / 1000
      );
      res.status(upstream.status).send(text);
    } catch (e: any) {
      console.error("Error proxying visualization metrics:", e);
      res.status(502).json({
        error: "visualization_metrics_proxy_error",
        message: String(e),
        targetsTried: targetUrls,
      });
    }
  }

  @Get("/api/proxy/prometheus")
  async proxyPrometheus(
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Only allow Prometheus proxy in non-production/dev environments
    if (process.env["NODE_ENV"] === "production") {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    if (this.embeddedMockBackendService.useEmbeddedE2eBackend()) {
      const query = String(req.query?.["query"] || "sum(up)");
      const start = req.query?.["start"]
        ? Number(req.query["start"])
        : undefined;
      const end = req.query?.["end"] ? Number(req.query["end"]) : undefined;
      const step = req.query?.["step"] ? Number(req.query["step"]) : undefined;
      res
        .status(200)
        .json(this.embeddedPrometheusPayload(query, start, end, step));
      return;
    }

    const prom = process.env["PROMETHEUS_URL"] || "http://127.0.0.1:9090";
    // Build search params robustly from req.query (arrays, numbers, etc.)
    const qp = new URLSearchParams();
    try {
      Object.entries(req.query || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v)) {
          v.forEach((x) => qp.append(k, String(x)));
        } else {
          qp.append(k, String(v));
        }
      });
    } catch (e) {
      console.error("Failed to build query params for Prometheus proxy:", e);
      res.status(400).send({ error: "invalid query params" });
      return;
    }

    const isRange = qp.has("start") || qp.has("end") || qp.has("step");
    const path = isRange ? "/api/v1/query_range" : "/api/v1/query";
    const baseCandidates = this.governanceUpstreamService.buildBaseCandidates(prom);
    const urls = baseCandidates.map((b) => `${b}${path}?${qp.toString()}`);
    const started = Date.now();
    try {
      const r = await this.governanceUpstreamService.fetchWithFallback(
        urls,
        { method: "GET" },
        7000
      );
      const body = await r.text();
      const ct = r.headers.get("content-type") || "application/json";
      if (!r.ok) {
        console.warn(
          "Prometheus proxy returned non-2xx status",
          r.status,
          "for",
          urls[0]
        );
      }
      recordPrometheusProxyMetrics(
        "GET",
        r.status,
        Buffer.byteLength(body ?? "", "utf8"),
        (Date.now() - started) / 1000
      );
      res.status(r.status);
      res.setHeader("content-type", ct);
      // send the raw body (string) to the client
      res.send(body ?? "");
    } catch (e: any) {
      console.error("Error proxying to Prometheus:", e);
      recordPrometheusProxyMetrics(
        "GET",
        502,
        0,
        (Date.now() - started) / 1000
      );
      res.status(502).send({
        error: "prometheus_proxy_error",
        message: String(e),
        targetsTried: urls,
      });
    }
  }

  @Get("/api/diagnostics/system-specs")
  getSystemSpecs(@Res() res: Response) {
    if (process.env["NODE_ENV"] === "production") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const specPath = join(
        process.cwd(),
        "tools",
        "data-generator",
        "logs",
        "system-specs.txt"
      );
      if (!existsSync(specPath)) {
        res.status(404).json({ error: "system-specs.txt not found" });
        return;
      }
      const txt = readFileSync(specPath, "utf8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(txt);
    } catch (e: any) {
      console.error("Error reading system-specs:", e);
      res.status(500).json({ error: String(e) });
    }
  }

  @Get("/api/diagnostics/system-specs.json")
  getSystemSpecsJson(@Res() res: Response) {
    if (process.env["NODE_ENV"] === "production") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const specPath = join(
        process.cwd(),
        "tools",
        "data-generator",
        "logs",
        "system-specs.txt"
      );
      if (!existsSync(specPath)) {
        res.status(404).json({ error: "system-specs.txt not found" });
        return;
      }
      const txt = readFileSync(specPath, "utf8");
      // Simple heuristic parser: key: value or key = value lines
      const lines = txt.split(/\r?\n/);
      const parsed: Record<string, string> = {};
      const sections: Record<string, string[]> = {};
      let currentSection = "default";
      sections[currentSection] = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          // blank line, keep as separator
          sections[currentSection].push("");
          continue;
        }
        // detect section headers like [Section] or === Section ===
        const sectMatch = line.match(/^\[([^\]]+)\]$|^=+\s*(.+?)\s*=+$/);
        if (sectMatch) {
          currentSection = (sectMatch[1] || sectMatch[2]).trim();
          sections[currentSection] = [];
          continue;
        }
        const kv = line.match(/^([^:=]+)\s*(?:[:=])\s*(.+)$/);
        if (kv) {
          const k = kv[1].trim();
          const v = kv[2].trim();
          parsed[k] = v;
          sections[currentSection].push(line);
          continue;
        }
        // otherwise treat as free text in current section
        sections[currentSection].push(line);
      }

      const result = { parsed, sections, raw: txt };
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.json(result);
    } catch (e: any) {
      console.error("Error parsing system-specs to JSON:", e);
      res.status(500).json({ error: String(e) });
    }
  }

  @Get("/api/diagnostics")
  getDiagnosticsIndex(@Res() res: Response) {
    if (process.env["NODE_ENV"] === "production") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const logDir = join(process.cwd(), "tools", "data-generator", "logs");
      if (!existsSync(logDir)) {
        res.status(404).json({ error: "diagnostics logs directory not found" });
        return;
      }
      const entries = readdirSync(logDir, { withFileTypes: true });
      const files = entries.filter((d) => d.isFile()).map((d) => d.name);
      res.json({ path: "diagnostics logs", files });
    } catch (e: any) {
      console.error("Error listing diagnostics files:", e);
      res.status(500).json({ error: String(e) });
    }
  }

  @Get("/api/diagnostics/docker-services")
  async getDockerServices(@Res() res: Response) {
    if (process.env["NODE_ENV"] === "production") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const net = await import("net");

      // Service definitions with localhost fallbacks for host-mode development
      const services: Array<{
        name: string;
        kind: "tcp" | "http";
        url: string;
        fallbackUrl?: string;
        icon?: string;
      }> = [
        {
          name: "Prometheus",
          kind: "http",
          url:
            process.env["PROMETHEUS_URL"] || "http://prometheus:9090/-/ready",
          fallbackUrl: "http://127.0.0.1:9090/-/ready",
          icon: "monitoring",
        },
        {
          name: "Grafana",
          kind: "http",
          url: process.env["GRAFANA_URL"] || "http://grafana:3000/api/health",
          fallbackUrl: "http://127.0.0.1:3000/api/health",
          icon: "dashboard",
        },
        {
          name: "Loki",
          kind: "http",
          url: process.env["LOKI_URL"] || "http://loki:3100/ready",
          fallbackUrl: "http://127.0.0.1:3100/ready",
          icon: "description",
        },
        {
          name: "Pulsar",
          kind: "tcp",
          url: process.env["PULSAR_BROKER"] || "pulsar:6650",
          fallbackUrl: "127.0.0.1:6650",
          icon: "cloud_queue",
        },
        {
          name: "Kafka",
          kind: "tcp",
          url: process.env["KAFKA_BROKER"] || "broker:9092",
          fallbackUrl: "127.0.0.1:9092",
          icon: "stream",
        },
        {
          name: "RabbitMQ",
          kind: "tcp",
          url: (process.env["RABBITMQ_URL"] || "rabbitmq:5672").replace(
            /^amqp:\/\//,
            ""
          ),
          fallbackUrl: "127.0.0.1:5672",
          icon: "swap_horiz",
        },
        {
          name: "Alertmanager",
          kind: "http",
          url:
            process.env["ALERTMANAGER_URL"] ||
            "http://alertmanager:9093/-/ready",
          fallbackUrl: "http://127.0.0.1:9093/-/ready",
          icon: "notifications",
        },
        {
          name: "Redis",
          kind: "tcp",
          url: (process.env["REDIS_URL"] || "redis:6379").replace(
            /^redis:\/\//,
            ""
          ),
          fallbackUrl: "127.0.0.1:6379",
          icon: "memory",
        },
      ];

      const results: Array<{
        name: string;
        status:
          | "healthy"
          | "degraded"
          | "offline"
          | "unknown"
          | "starting"
          | "stopping"
          | "maintenance";
        details?: string;
        error?: string;
        latencyMs?: number;
        icon?: string;
      }> = [];

      const checkTcp = (
        host: string,
        port: number,
        timeout = 1000
      ): Promise<{ ok: boolean; latencyMs: number; error?: string }> =>
        new Promise((resolve) => {
          const start = Date.now();
          const sock = new net.Socket();
          let done = false;
          const onDone = (ok: boolean, error?: string) => {
            if (done) return;
            done = true;
            const latencyMs = Date.now() - start;
            try {
              sock.destroy();
            } catch {
              /* ignore destroy errors */
            }
            resolve({ ok, latencyMs, error });
          };
          sock.setTimeout(timeout, () => onDone(false, "timeout"));
          sock.once("error", (err) =>
            onDone(false, err?.message || "connection_error")
          );
          sock.connect(port, host, () => onDone(true));
        });

      const checkHttp = async (
        url: string,
        timeout = 1000
      ): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
        const start = Date.now();
        try {
          const u = url.startsWith("http") ? url : `http://${url}`;
          const r = await this.governanceUpstreamService.fetchWithTimeout(
            u,
            { method: "GET" },
            timeout
          );
          return { ok: r.ok, latencyMs: Date.now() - start };
        } catch (e: any) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            error: e?.message || "fetch_error",
          };
        }
      };

      const serviceResults = await Promise.all(
        services.map(async (s) => {
          let result: { ok: boolean; latencyMs: number; error?: string } = {
            ok: false,
            latencyMs: 0,
            error: "not_checked",
          };
          let usedUrl = s.url;

          try {
            if (s.kind === "tcp") {
              const [hostPart, portPart] = s.url.split(":");
              const host = hostPart || "127.0.0.1";
              const port = Number(portPart) || 0;
              if (port > 0) {
                result = await checkTcp(host, port, 1000);
                if (!result.ok && s.fallbackUrl) {
                  const [fbHost, fbPort] = s.fallbackUrl.split(":");
                  const fbResult = await checkTcp(
                    fbHost || "127.0.0.1",
                    Number(fbPort) || port,
                    1000
                  );
                  if (fbResult.ok) {
                    result = fbResult;
                    usedUrl = s.fallbackUrl;
                  }
                }
              }
            } else {
              result = await checkHttp(s.url, 1000);
              if (!result.ok && s.fallbackUrl) {
                const fbResult = await checkHttp(s.fallbackUrl, 1000);
                if (fbResult.ok) {
                  result = fbResult;
                  usedUrl = s.fallbackUrl;
                }
              }
            }

            return {
              name: s.name,
              status: result.ok
                ? result.latencyMs > 1000
                  ? "degraded"
                  : "healthy"
                : "offline",
              details: usedUrl,
              error: result.error,
              latencyMs: result.latencyMs,
              icon: s.icon,
            } as {
              name: string;
              status:
                | "healthy"
                | "degraded"
                | "offline"
                | "unknown"
                | "starting"
                | "stopping"
                | "maintenance";
              details?: string;
              error?: string;
              latencyMs?: number;
              icon?: string;
            };
          } catch (e: any) {
            return {
              name: s.name,
              status: "unknown",
              details: usedUrl,
              error: String(e),
              icon: s.icon,
            } as {
              name: string;
              status:
                | "healthy"
                | "degraded"
                | "offline"
                | "unknown"
                | "starting"
                | "stopping"
                | "maintenance";
              details?: string;
              error?: string;
              latencyMs?: number;
              icon?: string;
            };
          }
        })
      );

      results.push(...serviceResults);

      res.json(results);
    } catch (e: any) {
      console.error("Error in getDockerServices:", e);
      res
        .status(500)
        .json({ error: "docker_services_error", message: String(e) });
    }
  }

  @Get("/api/diagnostics/docker-services/:name")
  async getDockerServiceByName(@Res() res: Response, @Req() req: Request) {
    const name = String(req.params?.["name"] || "");
    if (!name) {
      res.status(400).json({ error: "missing_name" });
      return;
    }
    // Reuse list of services from the main handler
    const services: Array<{
      name: string;
      kind: "tcp" | "http";
      url: string;
      fallbackUrl?: string;
    }> = [
      {
        name: "Prometheus",
        kind: "http",
        url: process.env["PROMETHEUS_URL"] || "http://prometheus:9090/-/ready",
        fallbackUrl: "http://127.0.0.1:9090/-/ready",
      },
      {
        name: "Grafana",
        kind: "http",
        url: process.env["GRAFANA_URL"] || "http://grafana:3000/api/health",
        fallbackUrl: "http://127.0.0.1:3000/api/health",
      },
      {
        name: "Loki",
        kind: "http",
        url: process.env["LOKI_URL"] || "http://loki:3100/ready",
        fallbackUrl: "http://127.0.0.1:3100/ready",
      },
      {
        name: "Pulsar",
        kind: "tcp",
        url: process.env["PULSAR_BROKER"] || "pulsar:6650",
        fallbackUrl: "127.0.0.1:6650",
      },
      {
        name: "Kafka",
        kind: "tcp",
        url: process.env["KAFKA_BROKER"] || "broker:9092",
        fallbackUrl: "127.0.0.1:9092",
      },
      {
        name: "RabbitMQ",
        kind: "tcp",
        url: (process.env["RABBITMQ_URL"] || "rabbitmq:5672").replace(
          /^amqp:\/\//,
          ""
        ),
        fallbackUrl: "127.0.0.1:5672",
      },
      {
        name: "Alertmanager",
        kind: "http",
        url:
          process.env["ALERTMANAGER_URL"] || "http://alertmanager:9093/-/ready",
        fallbackUrl: "http://127.0.0.1:9093/-/ready",
      },
      {
        name: "Redis",
        kind: "tcp",
        url: (process.env["REDIS_URL"] || "redis:6379").replace(
          /^redis:\/\//,
          ""
        ),
        fallbackUrl: "127.0.0.1:6379",
      },
    ];

    const service = services.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (!service) {
      res.status(404).json({ error: "service_not_found", name });
      return;
    }

    const net = await import("net");
    const checkTcp = (
      host: string,
      port: number,
      timeout = 1000
    ): Promise<{ ok: boolean; latencyMs: number; error?: string }> =>
      new Promise((resolve) => {
        const start = Date.now();
        const sock = new net.Socket();
        let done = false;
        const onDone = (ok: boolean, error?: string) => {
          if (done) return;
          done = true;
          const latencyMs = Date.now() - start;
          try {
            sock.destroy();
          } catch {
            /* ignore destroy errors */
          }
          resolve({ ok, latencyMs, error });
        };
        sock.setTimeout(timeout, () => onDone(false, "timeout"));
        sock.once("error", (err) =>
          onDone(false, err?.message || "connection_error")
        );
        sock.connect(port, host, () => onDone(true));
      });

    const checkHttp = async (
      url: string,
      timeout = 1000
    ): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
      const start = Date.now();
      try {
        const u = url.startsWith("http") ? url : `http://${url}`;
        const r = await this.governanceUpstreamService.fetchWithTimeout(
          u,
          { method: "GET" },
          timeout
        );
        return { ok: r.ok, latencyMs: Date.now() - start };
      } catch (e: any) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          error: e?.message || "fetch_error",
        };
      }
    };

    try {
      let result: { ok: boolean; latencyMs: number; error?: string } = {
        ok: false,
        latencyMs: 0,
        error: "not_checked",
      };
      let usedUrl = service.url;

      if (service.kind === "tcp") {
        const [hostPart, portPart] = service.url.split(":");
        const host = hostPart || "127.0.0.1";
        const port = Number(portPart) || 0;
        if (port > 0) {
          result = await checkTcp(host, port, 1000);
          if (!result.ok && service.fallbackUrl) {
            const [fbHost, fbPort] = service.fallbackUrl.split(":");
            const fbResult = await checkTcp(
              fbHost || "127.0.0.1",
              Number(fbPort) || port,
              1000
            );
            if (fbResult.ok) {
              result = fbResult;
              usedUrl = service.fallbackUrl;
            }
          }
        }
      } else {
        result = await checkHttp(service.url, 1000);
        if (!result.ok && service.fallbackUrl) {
          const fbResult = await checkHttp(service.fallbackUrl, 1000);
          if (fbResult.ok) {
            result = fbResult;
            usedUrl = service.fallbackUrl;
          }
        }
      }
      res.json({
        name: service.name,
        status: result.ok
          ? result.latencyMs > 1000
            ? "degraded"
            : "healthy"
          : "offline",
        details: usedUrl,
        error: result.error,
        latencyMs: result.latencyMs,
        lastChecked: Date.now(),
      });
    } catch (e: any) {
      res
        .status(500)
        .json({ name: service.name, status: "unknown", details: String(e) });
    }
  }

  @Get("/api/load-profile")
  getLoadProfile() {
    if (!this.runtimeLoad) {
      return {
        profilePct: 10,
        workers: 0,
        mode: "baseline",
        note: PROFILE_MAP[10].note,
      };
    }

    return this.runtimeLoad.status();
  }

  @Get("/api/load-profile/debug")
  loadProfileDebug() {
    const status = this.runtimeLoad
      ? this.runtimeLoad.status()
      : {
          profilePct: 10,
          workers: 0,
          mode: "baseline",
          note: PROFILE_MAP[10].note,
        };

    const workerDetails = this.runtimeLoad?.getWorkerSnapshots?.() ?? [];

    return {
      status,
      workers: workerDetails,
      telemetry: getTelemetryDebugInfo(),
    };
  }

  @Post("/api/load-profile")
  async setLoadProfile(
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    try {
      if (!this.runtimeLoad) {
        res.status(503).json({
          error: "load_profile_unavailable",
          profilePct: 10,
          workers: 0,
          mode: "baseline",
          note: PROFILE_MAP[10].note,
        });
        return;
      }

      const body = (req as any).body || {};
      const pctRaw = Number(body.profilePct);
      const smokeSeconds =
        body.smokeSeconds !== undefined ? Number(body.smokeSeconds) : undefined;
      if (![10, 25, 50, 100].includes(pctRaw)) {
        res.status(400).json({ error: "invalid_profile_pct" });
        return;
      }
      const result = await this.runtimeLoad.setProfile(
        pctRaw as LoadProfilePct,
        smokeSeconds
      );

      // Keep SSE telemetry metrics in sync with the runtime load profile.
      updateRuntimeLoadProfileMetrics(
        result as {
          profilePct: LoadProfilePct;
          workers: number;
          mode: string;
          note: string;
        }
      );

      const topologyProfile = result as {
        profilePct?: number;
        workers?: number;
        note?: string;
      };
      try {
        const targetUrls = this.governanceUpstreamService.governanceBaseCandidates().map(
          (b) => `${b}/api/v1/metrics/topology/runtime-profile`
        );
        await this.governanceUpstreamService.fetchWithFallback(
          targetUrls,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              profilePct: topologyProfile.profilePct ?? pctRaw,
              workers: topologyProfile.workers ?? 0,
              note: topologyProfile.note ?? "",
            }),
          },
          3000
        );
      } catch (syncErr) {
        console.warn(
          "Failed to mirror runtime load profile to governance topology metrics:",
          syncErr
        );
      }
      res.status(200).json(result);
    } catch (e: any) {
      console.error("Failed to set runtime load profile:", e);
      res
        .status(500)
        .json({ error: "load_profile_failed", message: String(e) });
    }
  }

  // Explicit handlers for infra-status endpoints that must not be shadowed by
  // the @All wildcard below (NestJS v11 wildcard routing can be ambiguous).
  @Get("/api/v1/pulsar/status")
  getPulsarStatus(@Res() res: Response): void {
    res.json({
      brokers: 3,
      topics: 12,
      partitions: 24,
      status: "healthy",
      lastUpdated: new Date().toISOString(),
    });
  }

  @Get("/api/v1/rabbitmq/status")
  getRabbitMQStatus(@Res() res: Response): void {
    res.json({
      status: "healthy",
      connection: "established",
      queues: {
        audit: "cosmic.audit.queue",
        control: "cosmic.control.queue",
      },
      exchanges: {
        audit: "cosmic.audit.exchange",
        control: "cosmic.control.exchange",
      },
      lastUpdated: new Date().toISOString(),
    });
  }

  @All("/api/forge/*path")
  proxyForge(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Observable<unknown> {
    return this.forgeProxyService.handle(req, res, (method, status, responseBytes, durationSeconds) =>
      recordFrontendApiMetrics(
        "forge",
        method,
        status,
        responseBytes,
        durationSeconds
      )
    );
  }

  @All("/api/v1/*path")
  async proxyGovernance(
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    await this.governanceProxyService.handle(req, res, {
      tryHandleEmbeddedGovernance: (request, response) =>
        this.embeddedMockBackendService.handleGovernance(request, response),
      mockInfrastructureTelemetry: () => this.mockInfrastructureTelemetry(),
      classifyFrontendApiRoute,
      recordFrontendApiMetrics,
      recordGovernanceProxyMetrics,
    });
  }

  @Get("/api/v1/vo/cached-samples")
  async getVoCachedSamples(@Res() res: Response): Promise<void> {
    const started = Date.now();
    let samples = voCachedSamplesPayload();
    let cacheResult: keyof typeof redisCacheRequestsTotal = "bypass";
    let serialized = JSON.stringify(samples);
    try {
      const cached = await redisClient?.get(VO_CACHED_SAMPLES_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<
          string,
          Record<string, unknown>
        >;
        if (parsed && typeof parsed === "object") {
          samples = parsed;
          serialized = cached;
          cacheResult = "hit";
          res.setHeader("X-Cache", "HIT");
        }
      } else {
        cacheResult = redisClient ? "miss" : "bypass";
        res.setHeader("X-Cache", redisClient ? "MISS" : "BYPASS");
      }
    } catch (e) {
      console.warn("Failed to read VO cached samples from Redis:", e);
      redisCacheReadErrorsTotal += 1;
      cacheResult = "bypass";
      res.setHeader("X-Cache", "BYPASS");
    }

    if (res.getHeader("X-Cache") !== "HIT" && redisClient) {
      try {
        await redisClient.set(VO_CACHED_SAMPLES_KEY, JSON.stringify(samples), {
          EX: VO_CACHED_SAMPLES_TTL_SECONDS,
        });
        redisCacheBytesWrittenTotal += Buffer.byteLength(serialized, "utf8");
      } catch (e) {
        console.warn("Failed to populate VO cached samples in Redis:", e);
        redisCacheWriteErrorsTotal += 1;
      }
    }
    redisCacheRequestsTotal[cacheResult] += 1;
    redisCacheBytesServedTotal[cacheResult] += Buffer.byteLength(
      serialized,
      "utf8"
    );
    observeRedisCacheDuration((Date.now() - started) / 1000);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(samples);
  }

  @Get("/*path")
  async handleAll(@Req() req: Request, @Res() res: Response) {
    // Guard against SSR swallowing unhandled API routes.
    if (req.path && req.path.startsWith("/api/")) {
      res.status(404).json({ error: "api_route_not_found", path: req.path });
      return;
    }
    // let SsrService handle SSR or static fallback
    await this.ssr.render(req, res);
  }
}

// -------------------------------------------------------------
// Execution plans controller - Sprint 3 implementation
// -------------------------------------------------------------

@Module({
  providers: [
    SsrService,
    RuntimeLoadProfileService,
    ForgeProxyService,
    GovernanceUpstreamService,
    GovernanceProxyService,
    EmbeddedMockBackendService,
  ],
  controllers: [AppController, ExecutionPlansController],
})
class AppModule {}

async function bootstrap() {
  // Create Nest app (let Nest create its internal Express instance)
  const app = await NestFactory.create(AppModule);

  // static assets
  const browserDistFolder = join(
    process.cwd(),
    "dist",
    "apps",
    "frontend",
    "browser"
  );
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.use(express.static(browserDistFolder));
  expressInstance.use((req: Request, res: Response, next: any) => {
    const path = req.path || req.originalUrl || "";
    if (
      !path ||
      path.startsWith("/api/") ||
      path === "/metrics" ||
      /\.[a-z0-9]+$/i.test(path)
    ) {
      return next();
    }

    const started = Date.now();
    const routeGroup = classifyFrontendRoute(path);
    res.on("finish", () => {
      const lengthHeader = res.getHeader("content-length");
      const responseBytes =
        typeof lengthHeader === "string"
          ? Number(lengthHeader)
          : typeof lengthHeader === "number"
          ? lengthHeader
          : 0;
      recordFrontendRequestMetrics(
        routeGroup,
        req.method || "GET",
        res.statusCode,
        responseBytes,
        (Date.now() - started) / 1000
      );
    });
    return next();
  });

  // If dev, create vite server and attach middlewares for SSR
  if (
    process.env["NODE_ENV"] !== "production" &&
    process.env["DISABLE_NEST_VITE_DEV_SERVER"] !== "true"
  ) {
    try {
      const { createServer } = await import("vite");
      const vite = await createServer({
        root: process.cwd(),
        logLevel: "error",
        server: { middlewareMode: true as any },
      });
      // Ensure API routes are handled by Nest: skip vite middleware for /api/* to avoid proxy loops
      expressInstance.use((req: Request, res: Response, next: any) => {
        if (
          req.path &&
          (req.path.startsWith("/api/") || req.path === "/metrics")
        ) {
          return next();
        }
        return vite.middlewares(req as any, res as any, next);
      });
      // initialize SsrService with vite instance
      const ssr = app.get(SsrService);
      await ssr.init(vite);
    } catch (e) {
      console.warn("Could not start Vite dev server for Nest SSR:", e);
    }
  }

  const nestPort = process.env["PORT"] || process.env["FRONTEND_PORT"] || 3000;
  const runtimeLoad = app.get(RuntimeLoadProfileService);
  app.enableShutdownHooks();
  // initialize optional Redis client used for caching VO samples
  await initRedisClient();
  await app.listen(nestPort);
  console.log("Nest SSR server listening on", nestPort);
  startTelemetryLogWatcher();

  const shutdown = async () => {
    stopTelemetryLogWatcher();
    await runtimeLoad.shutdown();
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

// Avoid starting the Nest HTTP server when running unit tests (Jest)
if (
  typeof process !== "undefined" &&
  process.env &&
  process.env["JEST_WORKER_ID"] === undefined
) {
  bootstrap().catch((e) => console.error(e));
} else {
  // In test environments we skip starting the real HTTP server to avoid
  // port conflicts and long-running background work.
}

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
import express from "express";
import { createClient } from "redis";
import { createServer as createViteServer } from "vite";
import { CommonEngine } from "@angular/ssr";
import { join } from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { Request, Response } from "express";
import { spawn, type ChildProcess } from "child_process";

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
type EmbeddedJobRecord = {
  jobId: string;
  workflow: string;
  datasetId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  requestedBy?: string;
  lineage?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  logs: string[];
  artifacts: Array<{ name: string; url: string; mimeType?: string; size?: string }>;
};

const embeddedJobStore = new Map<string, EmbeddedJobRecord>();
let embeddedJobCounter = 0;

function createEmbeddedJobId(): string {
  embeddedJobCounter += 1;
  return `e2e-job-${Date.now()}-${embeddedJobCounter}`;
}

function createEmbeddedJob(
  payload: Record<string, unknown>
): EmbeddedJobRecord {
  const now = new Date().toISOString();
  const jobId = createEmbeddedJobId();
  const requestedBy =
    typeof payload["requestedBy"] === "string"
      ? (payload["requestedBy"] as string)
      : undefined;
  const parameters =
    payload["parameters"] && typeof payload["parameters"] === "object"
      ? ({ ...(payload["parameters"] as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};

  if (requestedBy === "ui-sample") {
    parameters["deferred"] = true;
  }

  return {
    jobId,
    workflow: String(payload["workflow"] || "import"),
    datasetId: payload["datasetId"]
      ? String(payload["datasetId"])
      : "embedded-dataset",
    status: "QUEUED",
    createdAt: now,
    updatedAt: now,
    requestedBy,
    lineage:
      payload["lineage"] && typeof payload["lineage"] === "object"
        ? { ...(payload["lineage"] as Record<string, unknown>) }
        : {},
    parameters,
    logs: [`${now} job created`, `${now} status=QUEUED`],
    artifacts: [],
  };
}

// workflowArtifacts() removed — fake artifact URLs pointed at paths with no handler.
// Real files are written by VoJobExecutor.java and registered under
//   /api/v1/jobs/{id}/artifacts/{name}
// Dev-mock jobs keep artifacts=[] so the UI shows an honest empty state.
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _workflowArtifacts_removed(
  workflow: string,
  jobId: string
): EmbeddedJobRecord["artifacts"] {
  const base = `/api/v1/jobs/${jobId}/artifact-content`;
  switch (workflow) {
    case "vo.cone-search":
      return [
        { name: "cone-search-3c273.votable.xml", url: `${base}/cone-search-3c273.votable.xml`, mimeType: "application/x-votable+xml", size: "42 KB" },
        { name: "cone-search-3c273.csv",         url: `${base}/cone-search-3c273.csv`,         mimeType: "text/csv",                   size: "18 KB" },
      ];
    case "vo.adql.query":
      return [
        { name: "query-result.votable.xml", url: `${base}/query-result.votable.xml`, mimeType: "application/x-votable+xml", size: "128 KB" },
        { name: "query-result.csv",         url: `${base}/query-result.csv`,         mimeType: "text/csv",                   size: "64 KB" },
      ];
    case "vo.obscore.search":
      return [
        { name: "obscore-m87-results.votable.xml", url: `${base}/obscore-m87-results.votable.xml`, mimeType: "application/x-votable+xml", size: "56 KB" },
      ];
    case "vo.datalink.resolve":
      return [
        { name: "datalink-manifest.votable.xml",    url: `${base}/datalink-manifest.votable.xml`,    mimeType: "application/x-votable+xml", size: "12 KB"  },
        { name: "ngvla-pilot-ms-0001.fits",          url: `${base}/ngvla-pilot-ms-0001.fits`,          mimeType: "application/fits",           size: "2.1 GB" },
        { name: "ngvla-pilot-ms-0001.ms.tar.gz",     url: `${base}/ngvla-pilot-ms-0001.ms.tar.gz`,     mimeType: "application/x-tar",          size: "4.8 GB" },
      ];
    case "vo.product.fetch":
      return [
        { name: "ngvla-pilot-ms-0001.fits", url: `${base}/ngvla-pilot-ms-0001.fits`, mimeType: "application/fits", size: "2.1 GB" },
      ];
    case "vo.soda.cutout":
      return [
        { name: "cutout-result.fits",   url: `${base}/cutout-result.fits`,   mimeType: "application/fits", size: "512 KB" },
        { name: "cutout-preview.png",   url: `${base}/cutout-preview.png`,   mimeType: "image/png",         size: "48 KB"  },
      ];
    case "vo.preview.fetch":
      return [
        { name: "preview.png", url: `${base}/preview.png`, mimeType: "image/png", size: "96 KB" },
      ];
    case "import":
      return [
        { name: "ingest-report.json",  url: `${base}/ingest-report.json`,  mimeType: "application/json", size: "8 KB" },
        { name: "provenance.json",     url: `${base}/provenance.json`,     mimeType: "application/json", size: "3 KB" },
      ];
    case "ingest":
      return [
        { name: "ingest-manifest.json", url: `${base}/ingest-manifest.json`, mimeType: "application/json", size: "5 KB" },
      ];
    case "export":
      return [
        { name: "export-bundle.tar.gz",   url: `${base}/export-bundle.tar.gz`,   mimeType: "application/x-tar",  size: "1.3 GB" },
        { name: "export-manifest.json",   url: `${base}/export-manifest.json`,   mimeType: "application/json",   size: "4 KB"   },
      ];
    case "diagnostics":
      return [
        { name: "diagnostics-report.json", url: `${base}/diagnostics-report.json`, mimeType: "application/json", size: "22 KB" },
      ];
    default:
      return [
        { name: "job-output.json", url: `${base}/job-output.json`, mimeType: "application/json", size: "2 KB" },
      ];
  }
}

// Seed the embedded job store with realistic dev-mode jobs so the Jobs view
// is populated immediately without requiring a running Java backend.
{
  const _now = Date.now();
  const _seed = (
    workflow: string,
    status: string,
    datasetId: string,
    minsAgo: number
  ): EmbeddedJobRecord => {
    const createdAt = new Date(_now - minsAgo * 60_000).toISOString();
    const j = createEmbeddedJob({ workflow, datasetId, requestedBy: "dev-seed" });
    j.status = status;
    j.createdAt = createdAt;
    j.updatedAt = createdAt;
    j.logs = [`${createdAt} job created`, `${createdAt} status=${status}`];
    // Artifacts stay [] in dev-mock mode; real output files come from the Java backend.
    return j;
  };
  for (const j of [
    _seed("import",        "COMPLETED", "ds-2026-alpha-001", 120),
    _seed("vo.cone-search", "COMPLETED", "ds-2026-alpha-002",  90),
    _seed("ingest",         "RUNNING",   "ds-2026-alpha-003",  45),
    _seed("export",         "QUEUED",    "ds-2026-alpha-004",  10),
    _seed("diagnostics",    "FAILED",    "ds-2026-alpha-005",  60),
  ]) {
    embeddedJobStore.set(j.jobId, j);
  }
}

// Advance a job's status based on elapsed time so the UI shows a realistic
// lifecycle without requiring a background timer.
function advanceJobStatus(job: EmbeddedJobRecord): EmbeddedJobRecord {
  if (job.status !== "QUEUED" && job.status !== "RUNNING") return job;
  const ageMs = Date.now() - new Date(job.updatedAt).getTime();
  const now = new Date().toISOString();
  if (job.status === "QUEUED" && ageMs > 5_000) {
    job.status = "RUNNING";
    job.updatedAt = now;
    job.logs.push(`${now} status=RUNNING`);
  } else if (job.status === "RUNNING" && ageMs > 12_000) {
    job.status = Math.random() < 0.15 ? "FAILED" : "COMPLETED";
    job.updatedAt = now;
    job.logs.push(`${now} status=${job.status}`);
  }
  return job;
}

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

type WorkerState = {
  id: number;
  cmd: string;
  args: string[];
  proc: ChildProcess;
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

// Redis client singleton (optional)
let redisClient: RedisClientOps | null = null;
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
    c.on("error", (err: unknown) => console.warn("Redis client error:", err));
    await c.connect();
    redisClient = c;
    console.log("Connected to Redis at", url);
  } catch (e) {
    // Not fatal — Redis is optional for caching
    console.warn("Could not initialize Redis client:", e);
    redisClient = null;
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

@Injectable()
class RuntimeLoadProfileService {
  private profile: LoadProfilePct = 10;
  private workers: WorkerState[] = [];
  private smokeTimer: NodeJS.Timeout | null = null;
  private readonly defaultSmokeSeconds = 180;

  status() {
    return {
      profilePct: this.profile,
      workers: this.workers.length,
      mode: this.workers.length > 0 ? "runtime-controlled" : "baseline",
      note: PROFILE_MAP[this.profile].note,
    };
  }

  async setProfile(
    pct: LoadProfilePct,
    smokeSeconds?: number
  ): Promise<Record<string, unknown>> {
    this.clearSmokeTimer();
    await this.stopWorkers();
    this.profile = pct;
    const spec = PROFILE_MAP[pct];

    if (spec.workers <= 0) {
      return this.status();
    }

    const started: WorkerState[] = [];
    try {
      for (let i = 0; i < spec.workers; i++) {
        const w = this.spawnWorker(i + 1, spec);
        started.push(w);
      }
      this.workers = started;
    } catch (e) {
      for (const w of started) {
        try {
          w.proc.kill("SIGTERM");
        } catch {
          void 0;
        }
      }
      this.workers = [];
      this.profile = 10;
      throw e;
    }

    if (pct === 100) {
      const seconds = Math.max(
        30,
        Number(smokeSeconds || this.defaultSmokeSeconds)
      );
      this.smokeTimer = setTimeout(() => {
        void this.setProfile(10).catch((err) =>
          console.error("Auto-revert to 10% failed:", err)
        );
      }, seconds * 1000);
    }

    return this.status();
  }

  async shutdown(): Promise<void> {
    this.clearSmokeTimer();
    await this.stopWorkers();
  }

  private clearSmokeTimer() {
    if (this.smokeTimer) {
      clearTimeout(this.smokeTimer);
      this.smokeTimer = null;
    }
  }

  private resolveGeneratorExecutable(): string {
    const isWin = process.platform === "win32";
    const candidate = isWin
      ? join(process.cwd(), "tools", "data-generator", "data-generator.exe")
      : join(process.cwd(), "tools", "data-generator", "data-generator-linux");
    if (!existsSync(candidate)) {
      throw new Error(`data-generator executable not found at ${candidate}`);
    }
    return candidate;
  }

  private spawnWorker(id: number, spec: RuntimeProfileSpec): WorkerState {
    const cmd = this.resolveGeneratorExecutable();
    const logDir = join(process.cwd(), "tools", "data-generator", "logs");
    try {
      mkdirSync(logDir, { recursive: true });
    } catch {
      void 0;
    }
    const sink = `file:${join(logDir, `runtime-profile.worker-${id}.bin`)}`;
    const args = [
      `--rate=${spec.ratePerWorker}`,
      `--payload-size=${spec.payloadSize}`,
      "--no-stdout",
      `--sink=${sink}`,
      "--audit-every=2000",
    ];

    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    proc.stderr?.on("data", (chunk) => {
      const msg = String(chunk || "").trim();
      if (msg) console.log(`[runtime-load worker-${id}] ${msg}`);
    });
    proc.on("exit", (code, signal) => {
      console.log(
        `[runtime-load worker-${id}] exited code=${code} signal=${signal}`
      );
      this.workers = this.workers.filter((w) => w.id !== id);
    });
    proc.on("error", (err) => {
      console.error(`[runtime-load worker-${id}] error`, err);
    });
    return { id, cmd, args, proc };
  }

  private async stopWorkers(): Promise<void> {
    const current = [...this.workers];
    this.workers = [];
    await Promise.all(
      current.map(
        (w) =>
          new Promise<void>((resolve) => {
            if (w.proc.killed || w.proc.exitCode !== null) {
              resolve();
              return;
            }
            const done = () => resolve();
            w.proc.once("exit", done);
            try {
              w.proc.kill("SIGTERM");
            } catch {
              resolve();
            }
            setTimeout(() => {
              if (w.proc.exitCode === null) {
                try {
                  w.proc.kill("SIGKILL");
                } catch {
                  void 0;
                }
              }
              resolve();
            }, 2000);
          })
      )
    );
  }
}

@Controller()
export class AppController {
  constructor(
    private ssr: SsrService,
    private runtimeLoad: RuntimeLoadProfileService
  ) {}

  private buildBaseCandidates(baseUrl: string): string[] {
    const out = [baseUrl];
    try {
      const u = new URL(baseUrl);
      if (u.hostname === "localhost") {
        const v4 = new URL(baseUrl);
        v4.hostname = "127.0.0.1";
        out.push(v4.toString().replace(/\/$/, ""));
      } else if (u.hostname === "127.0.0.1") {
        const local = new URL(baseUrl);
        local.hostname = "localhost";
        out.push(local.toString().replace(/\/$/, ""));
      }
    } catch {
      // ignore malformed base URL and use original only
    }
    return Array.from(new Set(out));
  }

  private useEmbeddedE2eBackend(): boolean {
    return process.env["USE_EMBEDDED_E2E_BACKEND"] === "true";
  }

  private embeddedPrometheusPayload(query: string) {
    const value =
      query.includes("sum(up)") || query.includes('up{job="data-generator"}')
        ? "1"
        : query.includes("generator_bytes_produced_total")
        ? "524288"
        : query.includes("generator_records_produced_total")
        ? "120"
        : query.includes("process_cpu_seconds_total")
        ? "17.5"
        : "1";

    return {
      status: "success",
      data: {
        resultType: "vector",
        result: [
          {
            metric: {},
            value: [Math.floor(Date.now() / 1000), value],
          },
        ],
      },
    };
  }

  private embeddedTopologyMetrics() {
    const jobs = Array.from(embeddedJobStore.values());
    return {
      profilePct: 25,
      workers: 2,
      note: "embedded-e2e-backend",
      counts: {
        queued: jobs.filter((job) => job.status === "QUEUED").length,
        running: jobs.filter((job) => job.status === "RUNNING").length,
        completed: jobs.filter((job) => job.status === "COMPLETED").length,
      },
    };
  }

  private tryHandleEmbeddedGovernance(req: Request, res: Response): boolean {
    if (!this.useEmbeddedE2eBackend()) {
      return false;
    }

    const path = req.path || req.originalUrl || "";
    const method = (req.method || "GET").toUpperCase();
    const sendJson = (statusCode: number, body: unknown) => {
      res.status(statusCode).json(body);
      return true;
    };

    if (method === "GET" && path === "/api/v1/public-sources") {
      return sendJson(200, [
        {
          name: "Embedded Sample Source",
          url: "https://example.invalid/embedded-source",
        },
      ]);
    }

    if (method === "GET" && path === "/api/v1/admin/dispatch") {
      return sendJson(200, {
        intervalSeconds: 30,
        scannedCount: embeddedJobStore.size,
        dispatchedCount: embeddedJobStore.size,
      });
    }

    if (method === "POST" && path === "/api/v1/admin/dispatch") {
      return sendJson(200, {
        intervalSeconds: Number(
          (req.body as { intervalSeconds?: number })?.intervalSeconds || 30
        ),
        scannedCount: embeddedJobStore.size,
        dispatchedCount: embeddedJobStore.size,
      });
    }

    if (method === "POST" && path === "/api/v1/admin/release-deferred") {
      let released = 0;
      for (const job of embeddedJobStore.values()) {
        if (job.parameters?.["deferred"] === true) {
          job.parameters["deferred"] = false;
          job.status = "COMPLETED";
          job.updatedAt = new Date().toISOString();
          job.logs.push(`${job.updatedAt} status=COMPLETED`);
          released += 1;
        }
      }
      return sendJson(200, { released });
    }

    if (method === "GET" && path === "/api/v1/jobs/types") {
      return sendJson(200, [
        "import",
        "ingest",
        "export",
        "diagnostics",
        "cleanup",
      ]);
    }

    if (method === "POST" && path === "/api/v1/jobs/validate") {
      return sendJson(200, { valid: true });
    }

    if (method === "GET" && path === "/api/v1/jobs") {
      const jobs = Array.from(embeddedJobStore.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      return sendJson(200, jobs);
    }

    if (method === "POST" && path === "/api/v1/jobs") {
      const payload =
        req.body && typeof req.body === "object"
          ? (req.body as Record<string, unknown>)
          : {};
      const job = createEmbeddedJob(payload);
      embeddedJobStore.set(job.jobId, job);
      const statusCode = payload["requestedBy"] ? 202 : 201;
      return sendJson(statusCode, {
        jobId: job.jobId,
        status: job.status,
        queuedAt: job.createdAt,
      });
    }

    const pathMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)(?:\/(.+))?$/);
    if (!pathMatch) {
      return false;
    }

    const jobId = decodeURIComponent(pathMatch[1]);
    const suffix = pathMatch[2] || "";
    const job = embeddedJobStore.get(jobId);

    if (!job) {
      return sendJson(404, { error: "not_found", jobId });
    }

    if (method === "GET" && !suffix) {
      return sendJson(200, job);
    }

    if (method === "DELETE" && !suffix) {
      embeddedJobStore.delete(jobId);
      res.status(204).send();
      return true;
    }

    if (method === "POST" && suffix === "transition") {
      const body =
        req.body && typeof req.body === "object"
          ? (req.body as Record<string, unknown>)
          : {};
      const nextState = String(body["newState"] || body["state"] || "QUEUED");
      job.status = nextState;
      job.updatedAt = new Date().toISOString();
      job.logs.push(`${job.updatedAt} status=${nextState}`);
      return sendJson(200, job);
    }

    if (method === "GET" && suffix === "lineage") {
      return sendJson(200, job.lineage || {});
    }

    if (method === "PUT" && suffix === "lineage") {
      job.lineage =
        req.body && typeof req.body === "object"
          ? { ...(req.body as Record<string, unknown>) }
          : {};
      job.updatedAt = new Date().toISOString();
      return sendJson(200, job.lineage);
    }

    if (method === "GET" && suffix === "logs") {
      return sendJson(200, job.logs);
    }

    if (method === "GET" && suffix === "artifacts") {
      return sendJson(200, job.artifacts);
    }

    return false;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = 7000
  ): Promise<globalThis.Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithFallback(
    urls: string[],
    init: RequestInit,
    timeoutMs = 7000
  ): Promise<globalThis.Response> {
    let lastError: unknown;
    for (const url of urls) {
      try {
        return await this.fetchWithTimeout(url, init, timeoutMs);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error("fetch_failed");
  }

  private governanceBaseCandidates(): string[] {
    const governanceBase =
      process.env["GOVERNANCE_API_URL"] || "http://127.0.0.1:8082";
    return this.buildBaseCandidates(governanceBase);
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
        { source: "backend", target: "prom" },
        { source: "data-generator", target: "pulsar" },
        { source: "data-generator", target: "kafka" },
        { source: "data-generator", target: "array-main" },
        { source: "data-generator", target: "array-lbl" },
        { source: "data-generator", target: "array-sba" },
        { source: "pulsar", target: "kafka" },
        { source: "zookeeper", target: "kafka" },
        { source: "rabbitmq", target: "java-governance" },
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

  @Get("/api/topology")
  getTopology() {
    return this.topologyPayload();
  }

  @Get("/api/metrics/topology")
  async proxyTopologyMetrics(@Res() res: Response): Promise<void> {
    if (this.useEmbeddedE2eBackend()) {
      res.status(200).json(this.embeddedTopologyMetrics());
      return;
    }

    const targetUrls = this.governanceBaseCandidates().map(
      (b) => `${b}/api/v1/metrics/topology`
    );
    try {
      const upstream = await this.fetchWithFallback(
        targetUrls,
        { method: "GET" },
        7000
      );
      const text = await upstream.text();
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("content-type", ct);
      res.status(upstream.status).send(text);
    } catch (e: any) {
      console.error("Error proxying topology metrics:", e);
      res.status(502).json({
        error: "topology_metrics_proxy_error",
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

    if (this.useEmbeddedE2eBackend()) {
      const query = String(req.query?.["query"] || "sum(up)");
      res.status(200).json(this.embeddedPrometheusPayload(query));
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
    const baseCandidates = this.buildBaseCandidates(prom);
    const urls = baseCandidates.map((b) => `${b}${path}?${qp.toString()}`);
    console.log("Proxying Prometheus request to", urls[0]);
    try {
      const r = await this.fetchWithFallback(urls, { method: "GET" }, 7000);
      const body = await r.text();
      const ct = r.headers.get("content-type") || "application/json";
      console.log(
        "Prometheus responded",
        r.status,
        "content-type=",
        ct,
        "len=",
        body?.length ?? 0
      );
      res.status(r.status);
      res.setHeader("content-type", ct);
      // send the raw body (string) to the client
      res.send(body ?? "");
    } catch (e: any) {
      console.error("Error proxying to Prometheus:", e);
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
        url: process.env["PROMETHEUS_URL"] || "http://prometheus:9090/-/ready",
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
          process.env["ALERTMANAGER_URL"] || "http://alertmanager:9093/-/ready",
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
        const r = await this.fetchWithTimeout(u, { method: "GET" }, timeout);
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
        const r = await this.fetchWithTimeout(u, { method: "GET" }, timeout);
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
      const topologyProfile = result as {
        profilePct?: number;
        workers?: number;
        note?: string;
      };
      try {
        const targetUrls = this.governanceBaseCandidates().map(
          (b) => `${b}/api/v1/metrics/topology/runtime-profile`
        );
        await this.fetchWithFallback(
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

  @All("/api/v1/*path")
  async proxyGovernance(
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    if (this.tryHandleEmbeddedGovernance(req, res)) {
      return;
    }

    // Dev-mode alert mocks — Java AlertController is not running locally.
    // These must live here because @All("/api/v1/*path") is registered before
    // the individual @Get/@Post alert methods and shadows them in NestJS routing.
    const path = (req as any).path as string;
    const method = (req.method || "GET").toUpperCase();
    if (path === "/api/v1/alerts/slo" && method === "GET") {
      res.json({
        alertIngestedTotal: 0,
        alertLatencyMsP50: 0,
        alertLatencyMsP95: 0,
        alertLatencyMsP99: 0,
        dlqDepth: 0,
        replaysTotal: 0,
        measuredAt: new Date().toISOString(),
      });
      return;
    }
    if (path === "/api/v1/alerts/dlq" && method === "GET") {
      res.json([]);
      return;
    }
    if (path === "/api/v1/alerts/ingest" && method === "POST") {
      const body = (req as any).body ?? {};
      res.status(201).json({
        id: `dev-${Date.now()}`,
        eventType: body["eventType"] ?? "UNKNOWN",
        severity: body["severity"] ?? "INFO",
        sourceSystem: body["sourceSystem"] ?? "dev",
        correlationId: body["correlationId"] ?? `dev-corr-${Date.now()}`,
        message: body["message"] ?? "",
        issuedAt: new Date().toISOString(),
        replayed: false,
        tags: body["tags"] ?? [],
      });
      return;
    }
    if (path === "/api/v1/alerts/dlq/replay-all" && method === "POST") {
      res.json(0);
      return;
    }
    if (path.startsWith("/api/v1/alerts/dlq/replay/") && method === "POST") {
      res.status(404).json({ error: "alert_not_found" });
      return;
    }
    if (path === "/api/v1/alerts/dlq" && method === "POST") {
      res.status(201).end();
      return;
    }
    if (path === "/api/v1/broker-events" && method === "GET") {
      const r = res as unknown as import("express").Response;
      r.setHeader("Content-Type", "text/event-stream");
      r.setHeader("Cache-Control", "no-cache");
      r.setHeader("Connection", "keep-alive");
      r.setHeader("X-Accel-Buffering", "no");
      r.flushHeaders();
      const sendEvent = (type: string, payload: Record<string, unknown>) => {
        const data = JSON.stringify({ type, payload });
        r.write(`data: ${data}\n\n`);
      };
      sendEvent("connected", { source: "dev-mock", ts: Date.now() });
      const timer = setInterval(() => {
        sendEvent("heartbeat", { ts: Date.now() });
      }, 15000);
      r.on("close", () => clearInterval(timer));
      return;
    }

    // Dev-mode commissioning mocks (Java CommissioningController not running locally).
    const COMMISSIONING_SCENARIOS = [
      { id: "antenna_calibration", name: "Antenna Calibration", type: "aiv",
        description: "Validates antenna calibration parameters including pointing model, noise temperature, and efficiency at target frequencies.",
        requiredParameters: ["antennaId", "targetFrequencyMHz", "pointingModelVersion"] },
      { id: "timing_sync", name: "Timing Synchronisation", type: "aiv",
        description: "Validates that all array elements are synchronised to the timing reference within the accepted drift window.",
        requiredParameters: ["referenceElementId", "maxDriftNs", "syncProtocol"] },
      { id: "rfi_baseline", name: "RFI Baseline Survey", type: "aiv",
        description: "Validates the RFI environment baseline against the expected spectral occupancy thresholds for science operations.",
        requiredParameters: ["siteId", "frequencyRangeMHz", "maxOccupancyPercent"] },
    ];
    if (path === "/api/v1/commissioning/scenarios" && method === "GET") {
      res.json(COMMISSIONING_SCENARIOS);
      return;
    }
    if (path === "/api/v1/commissioning/validate" && method === "POST") {
      const body = (req as any).body ?? {};
      const scenarioId: string = body["scenarioId"] ?? "";
      const scenario = COMMISSIONING_SCENARIOS.find(s => s.id === scenarioId);
      if (!scenario) {
        res.status(404).json({ scenarioId, scenarioName: null, pass: false,
          failures: [`scenario_not_found: ${scenarioId}`], validatedAt: new Date().toISOString() });
        return;
      }
      const params: Record<string, unknown> = body["parameters"] ?? {};
      const failures = scenario.requiredParameters
        .filter(p => params[p] == null)
        .map(p => `missing_required_parameter: ${p}`);
      res.json({ scenarioId: scenario.id, scenarioName: scenario.name,
        pass: failures.length === 0, failures, validatedAt: new Date().toISOString() });
      return;
    }
    // ── Health / infra-status mocks ───────────────────────────────────────────
    if (path === "/api/v1/health" && method === "GET") {
      res.json({ status: "ok", service: "java-governance", timestamp: new Date().toISOString() });
      return;
    }
    if (path === "/api/v1/pulsar/status" && method === "GET") {
      res.json({
        brokers: 3,
        topics: 12,
        partitions: 24,
        status: "healthy",
        lastUpdated: new Date().toISOString(),
      });
      return;
    }
    if (path === "/api/v1/rabbitmq/status" && method === "GET") {
      res.json({
        status: "healthy",
        connection: "established",
        queues: { audit: "cosmic.audit.queue", control: "cosmic.control.queue" },
        exchanges: { audit: "cosmic.audit.exchange", control: "cosmic.control.exchange" },
        lastUpdated: new Date().toISOString(),
      });
      return;
    }
    // ── VO services mock ─────────────────────────────────────────────────────
    if (path === "/api/v1/vo/services" && method === "GET") {
      res.json({
        tapUrl: "https://heasarc.gsfc.nasa.gov/xamin/tap/sync",
        dataLinkUrl: "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/datalink",
      });
      return;
    }
    // ── Jobs mocks ───────────────────────────────────────────────────────────
    if (path === "/api/v1/jobs" && method === "GET") {
      const jobs = Array.from(embeddedJobStore.values())
        .map((j) => advanceJobStatus(j))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      res.json(jobs);
      return;
    }
    if (path === "/api/v1/jobs" && method === "POST") {
      const payload =
        (req as any).body && typeof (req as any).body === "object"
          ? ((req as any).body as Record<string, unknown>)
          : {};
      const job = createEmbeddedJob(payload);
      embeddedJobStore.set(job.jobId, job);
      res.status(201).json({
        jobId: job.jobId,
        status: job.status,
        queuedAt: job.createdAt,
      });
      return;
    }
    if (path === "/api/v1/jobs/types" && method === "GET") {
      res.json(["import", "ingest", "export", "diagnostics", "cleanup"]);
      return;
    }
    if (path === "/api/v1/jobs/validate" && method === "POST") {
      res.json({ valid: true });
      return;
    }
    if (path.match(/^\/api\/v1\/jobs\/[^/]+\/logs$/) && method === "GET") {
      const jobId = path.split("/").slice(-2)[0];
      const job = embeddedJobStore.get(jobId);
      res.json(job ? job.logs : []);
      return;
    }
    if (path.match(/^\/api\/v1\/jobs\/[^/]+\/artifacts$/) && method === "GET") {
      const jobId = path.split("/").slice(-2)[0];
      const job = embeddedJobStore.get(jobId);
      res.json(job ? job.artifacts : []);
      return;
    }
    if (path.match(/^\/api\/v1\/jobs\/[^/]+$/) && method === "GET") {
      const jobId = path.split("/").pop() ?? "unknown";
      const job = embeddedJobStore.get(jobId);
      if (!job) {
        res.status(404).json({ error: "not_found", jobId });
        return;
      }
      res.json(advanceJobStatus(job));
      return;
    }
    if (path.match(/^\/api\/v1\/jobs\/[^/]+$/) && method === "DELETE") {
      const jobId = path.split("/").pop() ?? "unknown";
      embeddedJobStore.delete(jobId);
      res.status(204).send();
      return;
    }
    if (path.match(/^\/api\/v1\/jobs\/[^/]+\/transition$/) && method === "POST") {
      const jobId = path.split("/").slice(-2)[0];
      const job = embeddedJobStore.get(jobId);
      if (!job) {
        res.status(404).json({ error: "not_found", jobId });
        return;
      }
      const body = (req as any).body ?? {};
      const nextStatus = String(
        (body["targetStatus"] as string | undefined) ||
        (body["state"] as string | undefined) ||
        (body["newState"] as string | undefined) ||
        "RUNNING"
      );
      job.status = nextStatus as EmbeddedJobRecord["status"];
      job.updatedAt = new Date().toISOString();
      job.logs.push(`${job.updatedAt} status=${nextStatus}`);
      embeddedJobStore.set(jobId, job);
      res.json(job);
      return;
    }
    // ── Admin dispatch mock ──────────────────────────────────────────────────
    if (path === "/api/v1/admin/dispatch" && method === "GET") {
      res.json({ intervalSeconds: 5, scannedCount: 0, dispatchedCount: 0 });
      return;
    }
    if (path === "/api/v1/admin/dispatch" && method === "POST") {
      const body = (req as any).body ?? {};
      const intervalSeconds = Number(body["intervalSeconds"] ?? 5);
      res.json({ intervalSeconds });
      return;
    }
    const targetUrls = this.governanceBaseCandidates().map((b) => `${b}${req.originalUrl}`);
    try {
      const headers = new Headers();
      Object.entries(req.headers || {}).forEach(([k, v]) => {
        if (!v) return;
        const key = k.toLowerCase();
        if (key === "host" || key === "content-length" || key === "connection")
          return;
        if (Array.isArray(v)) {
          v.forEach((x) => headers.append(k, String(x)));
        } else {
          headers.set(k, String(v));
        }
      });

      const method = (req.method || "GET").toUpperCase();
      let body: BodyInit | undefined;
      if (method !== "GET" && method !== "HEAD") {
        const hasBody =
          (req as any).body !== undefined && (req as any).body !== null;
        if (hasBody) {
          if (typeof (req as any).body === "string") {
            body = (req as any).body;
          } else {
            body = JSON.stringify((req as any).body);
            if (!headers.has("content-type"))
              headers.set("content-type", "application/json");
          }
        }
      }

      const upstream = await this.fetchWithFallback(
        targetUrls,
        { method, headers, body },
        7000
      );
      const text = await upstream.text();
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("content-type", ct);
      res.status(upstream.status).send(text);
    } catch (e: any) {
      console.error("Error proxying to governance API:", e);
      res.status(502).json({
        error: "governance_proxy_error",
        message: String(e),
        targetsTried: targetUrls,
      });
    }
  }

  @Get("/api/v1/vo/cached-samples")
  async getVoCachedSamples(@Res() res: Response): Promise<void> {
    // Return curated sample payloads keyed by VO workflow type.
    // Used by the submit dialog auto-fill feature.
    const samples: Record<string, Record<string, unknown>> = {
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
        _description: "ESO ObsCore image search around quasar 3C 273 (r=0.5\u00b0)",
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
        _description: "Chandra ACIS event file \u2014 Cas A supernova remnant (obs 21843)",
      },
      "vo.soda.cutout": {
        provider: "CADC",
        sodaUrl:
          "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/soda",
        datasetIdentifier: "ivo://cadc.nrc.ca/CFHT?2459817",
        spatialBoundsRa: 187.277915,
        spatialBoundsDec: 2.052389,
        spatialBoundsRadius: 0.1,
        outputFormat: "fits",
        liveMode: true,
        _description: "CADC SODA cutout centered on 3C 273 (r=0.1\u00b0, CFHT obs 2459817)",
      },
      "vo.preview.fetch": {
        provider: "ESASky",
        previewUrl:
          "https://sky.esa.int/esasky-tap/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=votable&QUERY=SELECT+TOP+5+*+FROM+mv_xsa_obs+WHERE+target_name+LIKE+%2527%2525Crab%2525%2527",
        liveMode: true,
        _description: "ESASky XMM-Newton observations matching 'Crab' target (top 5)",
      },
    };
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

@Module({
  providers: [SsrService, RuntimeLoadProfileService],
  controllers: [AppController],
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

  // If dev, create vite server and attach middlewares for SSR
  if (
    process.env["NODE_ENV"] !== "production" &&
    process.env["DISABLE_NEST_VITE_DEV_SERVER"] !== "true"
  ) {
    try {
      const vite = await createViteServer({
        root: process.cwd(),
        logLevel: "error",
        server: { middlewareMode: true as any },
      });
      // Ensure API routes are handled by Nest: skip vite middleware for /api/* to avoid proxy loops
      expressInstance.use((req: Request, res: Response, next: any) => {
        if (req.path && req.path.startsWith("/api/")) return next();
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

  const shutdown = async () => {
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

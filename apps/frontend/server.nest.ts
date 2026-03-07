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
import { createClient, RedisClientType } from "redis";
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

// Redis client singleton (optional)
let redisClient: RedisClientType | null = null;
async function initRedisClient() {
  const url = process.env["REDIS_URL"] || process.env["REDIS_URI"] || "redis://127.0.0.1:6379";
  try {
    const c: RedisClientType = createClient({ url });
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
    return this.runtimeLoad.status();
  }

  @Post("/api/load-profile")
  async setLoadProfile(
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    try {
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
    const baseCandidates = this.governanceBaseCandidates();
    const targetUrls = baseCandidates.map((b) => `${b}${req.originalUrl}`);
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
    const key = "vo:cached:chanmaster";
    try {
      // Try Redis first
      if (redisClient) {
        try {
          const cached = await redisClient.get(key);
          if (cached) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.send(cached);
            return;
          }
        } catch (e) {
          console.warn("Redis GET failed:", e);
        }
      }

      // Not in cache — fetch lightweight VOTable summary from governance API (same as telemetry expects)
      const baseCandidates = this.governanceBaseCandidates();
      const urls = baseCandidates.map((b) => `${b}/api/v1/vo/votable?table=chanmaster&position=3c273`);
      const upstream = await this.fetchWithFallback(urls, { method: "GET" }, 7000);
      const txt = await upstream.text();
      const ct = upstream.headers.get("content-type") || "application/json";

      // Optionally cache the raw JSON string in Redis for short TTL
      if (redisClient) {
        try {
          // store with short TTL (30 seconds)
          await redisClient.set(key, txt, { EX: 30 });
        } catch (e) {
          console.warn("Redis SET failed:", e);
        }
      }

      res.setHeader("Content-Type", ct);
      res.status(upstream.status).send(txt);
    } catch (e: any) {
      console.error("Error fetching VO cached samples:", e);
      res.status(502).json({ error: "vo_fetch_error", message: String(e) });
    }
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
  if (process.env["NODE_ENV"] !== "production") {
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
if (typeof process !== "undefined" && process.env && process.env["JEST_WORKER_ID"] === undefined) {
  bootstrap().catch((e) => console.error(e));
} else {
  // In test environments we skip starting the real HTTP server to avoid
  // port conflicts and long-running background work.
}

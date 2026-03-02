/* eslint-disable @typescript-eslint/no-explicit-any */
// tsconfig-paths registration happens during bootstrap when necessary
import { NestFactory } from '@nestjs/core';
import '@angular/compiler';
// explicit any usage in this bootstrap file is intentional (vite dev middleware, SSR bootstrap)
import { Module, Controller, Get, Post, Req, Res, Injectable, All } from '@nestjs/common';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { CommonEngine } from '@angular/ssr';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { Request, Response } from 'express';
import { spawn, type ChildProcess } from 'child_process';

type LoadProfilePct = 10 | 25 | 50 | 100;

type RuntimeProfileSpec = {
  workers: number;
  ratePerWorker: number;
  payloadSize: number;
  note: string;
};

const PROFILE_MAP: Record<LoadProfilePct, RuntimeProfileSpec> = {
  10: { workers: 0, ratePerWorker: 0, payloadSize: 512, note: 'baseline (no extra runtime workers)' },
  25: { workers: 2, ratePerWorker: 500_000, payloadSize: 1024, note: 'low stress' },
  50: { workers: 4, ratePerWorker: 1_500_000, payloadSize: 1024, note: 'medium stress' },
  100: { workers: 8, ratePerWorker: 3_000_000, payloadSize: 2048, note: 'smoke stress (bounded)' },
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

@Injectable()
class SsrService {
  options: SsrOptions;

  constructor() {
    // initialize synchronously; further initialization happens in init()
    const serverDistFolder = join(process.cwd(), 'dist', 'apps', 'frontend', 'server');
    const browserDistFolder = join(process.cwd(), 'dist', 'apps', 'frontend', 'browser');
    const indexServerHtml = join(serverDistFolder, 'index.server.html');
    const indexHtmlPath = existsSync(indexServerHtml)
      ? indexServerHtml
      : join(process.cwd(), 'apps', 'frontend', 'src', 'index.html');

    this.options = {
      browserDistFolder,
      indexHtmlPath,
      isDev: process.env['NODE_ENV'] !== 'production',
      commonEngine: new CommonEngine(),
    } as SsrOptions;
  }

  async init(viteServer?: any) {
    this.options.viteServer = viteServer;
  }

  getPublicEnv() {
    const allowed = [
      'NODE_ENV',
      'PORT',
      'FRONTEND_PORT',
      'MINIO_ROOT_USER',
      'PNPM_STORE_DIR',
      'KAFKA_BROKER',
      'RABBITMQ_URL',
    ];
    const out: Record<string, string> = {};
    allowed.forEach((k) => {
      if (process.env[k] !== undefined) out[k] = process.env[k] as string;
    });
    return out;
  }

  getSecrets() {
    const secrets = ['MINIO_ROOT_PASSWORD'];
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
          console.error('SSR render error:', err);
          res.status(500).send(`<pre>${(err && err.stack) || String(err)}</pre>`);
        });
    }

    try {
      const indexHtmlRaw = readFileSync(join(process.cwd(), 'apps', 'frontend', 'src', 'index.html'), 'utf8');
      let transformed = await viteServer.transformIndexHtml(req.originalUrl, indexHtmlRaw);
      const tmpDir = join(process.cwd(), '.angular', 'dev_ssr');
      try {
        mkdirSync(tmpDir, { recursive: true });
      } catch {
        void 0;
      }
      const tmpIndex = join(tmpDir, 'index.server.html');
      // Ensure the transformed index contains a doctype and an <app-root> element
      try {
        if (!/<!doctype/i.test(transformed)) {
          transformed = '<!DOCTYPE html>\n' + transformed;
        }
        if (!/<app-root\b/i.test(transformed)) {
          transformed = transformed.replace(/<\/body>/i, '  <app-root></app-root>\n</body>');
        }
      } catch (e) {
        console.warn('Failed to normalize transformed index for SSR:', e);
      }

      writeFileSync(tmpIndex, transformed, 'utf8');

      const mod = await viteServer.ssrLoadModule('/apps/frontend/src/main.server.ts');
      const bootstrapFn = (mod && (mod.default || mod.bootstrap)) as any;
      try {
        // Debug: log which index file and a small snippet so we can confirm the document
        try {
          const tmpHtml = readFileSync(tmpIndex, 'utf8');
          console.log('Dev SSR using documentFilePath:', tmpIndex);
          console.log('Dev SSR document length:', tmpHtml.length);
          console.log('Dev SSR document snippet:', tmpHtml.slice(0, 200).replace(/\n/g, ' '));
        } catch (e) {
          console.warn('Could not read tmpIndex for debug logging:', e);
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
            console.error('Dev SSR render error:', err);
            res.status(500).send(`<pre>${(err && err.stack) || String(err)}</pre>`);
          });
      } catch (e) {
        console.error('Dev SSR pipeline error before render:', e);
        res.status(500).send(`<pre>${String(e)}</pre>`);
      }
    } catch (e) {
      console.error('Dev SSR pipeline error:', e);
      res.setHeader('Content-Type', 'text/html');
      res.send(readFileSync(join(process.cwd(), 'apps', 'frontend', 'src', 'index.html'), 'utf8'));
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
      mode: this.workers.length > 0 ? 'runtime-controlled' : 'baseline',
      note: PROFILE_MAP[this.profile].note,
    };
  }

  async setProfile(pct: LoadProfilePct, smokeSeconds?: number): Promise<Record<string, unknown>> {
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
          w.proc.kill('SIGTERM');
        } catch {
          void 0;
        }
      }
      this.workers = [];
      this.profile = 10;
      throw e;
    }

    if (pct === 100) {
      const seconds = Math.max(30, Number(smokeSeconds || this.defaultSmokeSeconds));
      this.smokeTimer = setTimeout(() => {
        void this.setProfile(10).catch((err) => console.error('Auto-revert to 10% failed:', err));
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
    const isWin = process.platform === 'win32';
    const candidate = isWin
      ? join(process.cwd(), 'tools', 'data-generator', 'data-generator.exe')
      : join(process.cwd(), 'tools', 'data-generator', 'data-generator-linux');
    if (!existsSync(candidate)) {
      throw new Error(`data-generator executable not found at ${candidate}`);
    }
    return candidate;
  }

  private spawnWorker(id: number, spec: RuntimeProfileSpec): WorkerState {
    const cmd = this.resolveGeneratorExecutable();
    const logDir = join(process.cwd(), 'tools', 'data-generator', 'logs');
    try {
      mkdirSync(logDir, { recursive: true });
    } catch {
      void 0;
    }
    const sink = `file:${join(logDir, `runtime-profile.worker-${id}.bin`)}`;
    const args = [
      `--rate=${spec.ratePerWorker}`,
      `--payload-size=${spec.payloadSize}`,
      '--no-stdout',
      `--sink=${sink}`,
      '--audit-every=2000',
    ];

    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    proc.stderr?.on('data', (chunk) => {
      const msg = String(chunk || '').trim();
      if (msg) console.log(`[runtime-load worker-${id}] ${msg}`);
    });
    proc.on('exit', (code, signal) => {
      console.log(`[runtime-load worker-${id}] exited code=${code} signal=${signal}`);
      this.workers = this.workers.filter((w) => w.id !== id);
    });
    proc.on('error', (err) => {
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
            w.proc.once('exit', done);
            try {
              w.proc.kill('SIGTERM');
            } catch {
              resolve();
            }
            setTimeout(() => {
              if (w.proc.exitCode === null) {
                try {
                  w.proc.kill('SIGKILL');
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
class AppController {
  constructor(private ssr: SsrService, private runtimeLoad: RuntimeLoadProfileService) {}

  @Get('/api/env')
  getEnv() {
    return this.ssr.getPublicEnv();
  }

  @Get('/api/proxy/prometheus')
  async proxyPrometheus(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Only allow Prometheus proxy in non-production/dev environments
    if (process.env['NODE_ENV'] === 'production') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const prom = process.env['PROMETHEUS_URL'] || 'http://localhost:9090';
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
      console.error('Failed to build query params for Prometheus proxy:', e);
      res.status(400).send({ error: 'invalid query params' });
      return;
    }

    const isRange = qp.has('start') || qp.has('end') || qp.has('step');
    const path = isRange ? '/api/v1/query_range' : '/api/v1/query';
    const url = `${prom}${path}?${qp.toString()}`;
    console.log('Proxying Prometheus request to', url);
    try {
      const r = await fetch(url, { method: 'GET' });
      const body = await r.text();
      const ct = r.headers.get('content-type') || 'application/json';
      console.log('Prometheus responded', r.status, 'content-type=', ct, 'len=', body?.length ?? 0);
      res.status(r.status);
      res.setHeader('content-type', ct);
      // send the raw body (string) to the client
      res.send(body ?? '');
    } catch (e: any) {
      console.error('Error proxying to Prometheus:', e);
      res.status(502).send({ error: String(e) });
    }
  }

  @Get('/api/diagnostics/system-specs')
  getSystemSpecs(@Res() res: Response) {
    if (process.env['NODE_ENV'] === 'production') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    try {
      const specPath = join(process.cwd(), 'tools', 'data-generator', 'logs', 'system-specs.txt');
      if (!existsSync(specPath)) {
        res.status(404).json({ error: 'system-specs.txt not found' });
        return;
      }
      const txt = readFileSync(specPath, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(txt);
    } catch (e: any) {
      console.error('Error reading system-specs:', e);
      res.status(500).json({ error: String(e) });
    }
  }

  @Get('/api/diagnostics/system-specs.json')
  getSystemSpecsJson(@Res() res: Response) {
    if (process.env['NODE_ENV'] === 'production') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    try {
      const specPath = join(process.cwd(), 'tools', 'data-generator', 'logs', 'system-specs.txt');
      if (!existsSync(specPath)) {
        res.status(404).json({ error: 'system-specs.txt not found' });
        return;
      }
      const txt = readFileSync(specPath, 'utf8');
      // Simple heuristic parser: key: value or key = value lines
      const lines = txt.split(/\r?\n/);
      const parsed: Record<string, string> = {};
      const sections: Record<string, string[]> = {};
      let currentSection = 'default';
      sections[currentSection] = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          // blank line, keep as separator
          sections[currentSection].push('');
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
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json(result);
    } catch (e: any) {
      console.error('Error parsing system-specs to JSON:', e);
      res.status(500).json({ error: String(e) });
    }
  }

  @Get('/api/diagnostics')
  getDiagnosticsIndex(@Res() res: Response) {
    if (process.env['NODE_ENV'] === 'production') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    try {
      const logDir = join(process.cwd(), 'tools', 'data-generator', 'logs');
      if (!existsSync(logDir)) {
        res.status(404).json({ error: 'diagnostics logs directory not found' });
        return;
      }
      const entries = readdirSync(logDir, { withFileTypes: true });
      const files = entries.filter((d) => d.isFile()).map((d) => d.name);
      res.json({ path: logDir, files });
    } catch (e: any) {
      console.error('Error listing diagnostics files:', e);
      res.status(500).json({ error: String(e) });
    }
  }

  @Get('/api/load-profile')
  getLoadProfile() {
    return this.runtimeLoad.status();
  }

  @Post('/api/load-profile')
  async setLoadProfile(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const body = (req as any).body || {};
      const pctRaw = Number(body.profilePct);
      const smokeSeconds = body.smokeSeconds !== undefined ? Number(body.smokeSeconds) : undefined;
      if (![10, 25, 50, 100].includes(pctRaw)) {
        res.status(400).json({ error: 'invalid_profile_pct' });
        return;
      }
      const result = await this.runtimeLoad.setProfile(pctRaw as LoadProfilePct, smokeSeconds);
      res.status(200).json(result);
    } catch (e: any) {
      console.error('Failed to set runtime load profile:', e);
      res.status(500).json({ error: 'load_profile_failed', message: String(e) });
    }
  }

  @All('/api/v1/*')
  async proxyGovernance(@Req() req: Request, @Res() res: Response): Promise<void> {
    const governanceBase = process.env['GOVERNANCE_API_URL'] || 'http://localhost:8082';
    const targetUrl = `${governanceBase}${req.originalUrl}`;
    try {
      const headers = new Headers();
      Object.entries(req.headers || {}).forEach(([k, v]) => {
        if (!v) return;
        const key = k.toLowerCase();
        if (key === 'host' || key === 'content-length' || key === 'connection') return;
        if (Array.isArray(v)) {
          v.forEach((x) => headers.append(k, String(x)));
        } else {
          headers.set(k, String(v));
        }
      });

      const method = (req.method || 'GET').toUpperCase();
      let body: BodyInit | undefined;
      if (method !== 'GET' && method !== 'HEAD') {
        const hasBody = (req as any).body !== undefined && (req as any).body !== null;
        if (hasBody) {
          if (typeof (req as any).body === 'string') {
            body = (req as any).body;
          } else {
            body = JSON.stringify((req as any).body);
            if (!headers.has('content-type')) headers.set('content-type', 'application/json');
          }
        }
      }

      const upstream = await fetch(targetUrl, { method, headers, body });
      const text = await upstream.text();
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('content-type', ct);
      res.status(upstream.status).send(text);
    } catch (e: any) {
      console.error('Error proxying to governance API:', e);
      res.status(502).json({ error: 'governance_proxy_error', message: String(e) });
    }
  }

  @Get('*')
  async handleAll(@Req() req: Request, @Res() res: Response) {
    // Guard against SSR swallowing unhandled API routes.
    if (req.path && req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'api_route_not_found', path: req.path });
      return;
    }
    // let SsrService handle SSR or static fallback
    await this.ssr.render(req, res);
  }
}

@Module({ providers: [SsrService, RuntimeLoadProfileService], controllers: [AppController] })
class AppModule {}

async function bootstrap() {
  // Create Nest app (let Nest create its internal Express instance)
  const app = await NestFactory.create(AppModule);

  // static assets
  const browserDistFolder = join(process.cwd(), 'dist', 'apps', 'frontend', 'browser');
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.use(express.static(browserDistFolder));

  // If dev, create vite server and attach middlewares for SSR
  if (process.env['NODE_ENV'] !== 'production') {
    try {
      const vite = await createViteServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true as any } });
      // Ensure API routes are handled by Nest: skip vite middleware for /api/* to avoid proxy loops
      expressInstance.use((req: Request, res: Response, next: any) => {
        if (req.path && req.path.startsWith('/api/')) return next();
        return vite.middlewares(req as any, res as any, next);
      });
      // initialize SsrService with vite instance
      const ssr = app.get(SsrService);
      await ssr.init(vite);
    } catch (e) {
      console.warn('Could not start Vite dev server for Nest SSR:', e);
    }
  }

  const nestPort = process.env['PORT'] || process.env['FRONTEND_PORT'] || 3000;
  const runtimeLoad = app.get(RuntimeLoadProfileService);
  app.enableShutdownHooks();
  await app.listen(nestPort);
  console.log('Nest SSR server listening on', nestPort);

  const shutdown = async () => {
    await runtimeLoad.shutdown();
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

bootstrap().catch((e) => console.error(e));

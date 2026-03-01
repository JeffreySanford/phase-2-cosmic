/* eslint-disable @typescript-eslint/no-explicit-any */
// tsconfig-paths registration happens during bootstrap when necessary
import { NestFactory } from '@nestjs/core';
import '@angular/compiler';
// explicit any usage in this bootstrap file is intentional (vite dev middleware, SSR bootstrap)
import { Module, Controller, Get, Req, Res, Injectable } from '@nestjs/common';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { CommonEngine } from '@angular/ssr';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { Request, Response } from 'express';

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

@Controller()
class AppController {
  constructor(private ssr: SsrService) {}

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

  @Get('*')
  async handleAll(@Req() req: Request, @Res() res: Response) {
    // let SsrService handle SSR or static fallback
    await this.ssr.render(req, res);
  }
}

@Module({ providers: [SsrService], controllers: [AppController] })
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
  await app.listen(nestPort);
  console.log('Nest SSR server listening on', nestPort);
}

bootstrap().catch((e) => console.error(e));

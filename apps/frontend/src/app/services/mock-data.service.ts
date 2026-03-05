import { Injectable } from '@angular/core';
import { of, Observable } from 'rxjs';
import { LoadProfileService } from './load-profile.service';

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

@Injectable({ providedIn: 'root' })
export class MockDataService {
  constructor(private loadProfile: LoadProfileService) {}

  private scale(): number {
    const pct = this.loadProfile.current ?? 10;
    // map 10->0.1, 25->0.25, 50->0.5, 100->1.0
    return pct / 100;
  }

  // Topology metrics: return map of linkKey -> { currentMBps, maxMBps }
  topologyMetricsForLinks(keys: string[]): Observable<Record<string, { currentMBps: number; maxMBps?: number }>> {
    const s = this.scale();
    const out: Record<string, { currentMBps: number; maxMBps?: number }> = {};
    for (const k of keys) {
      const max = Math.round((rand(50, 500) * s) * 10) / 10 + 1;
      const cur = Math.round(max * rand(0.1, 1.0) * 10) / 10;
      out[k] = { currentMBps: cur, maxMBps: max };
    }
    return of(out);
  }

  // Visualization metrics: basic shape for visualization component
  visualizationMetrics(): Observable<any> {
    const s = this.scale();
    const now = Date.now();
    const sparkline = Array.from({ length: 40 }).map((_, i) => ({ t: now - (40 - i) * 1000, v: Math.round(rand(20, 80) * s * 10) / 10 }));
    const histogram = Array.from({ length: 10 }).map(() => Math.floor(rand(0, 50) * s));
    const scatter = Array.from({ length: 60 }).map(() => ({ x: Math.random() * 100 * s, y: Math.random() * 100 * s }));
    const throughput = Math.round((sparkline[sparkline.length - 1].v || 0) * 10) / 10;
    return of({ source: 'mock', data: { throughput, errorRate: +(Math.random() * 2).toFixed(2), queueDepth: Math.round(rand(0, 50) * s), sparkline, histogram, scatter } });
  }

  // Telemetry mock: produce Prometheus-like range response
  telemetryRange(metric: string, start: number, end: number, step: number): Observable<unknown> {
    const s = this.scale();
    const points: Array<[number, string]> = [];
    for (let t = start; t <= end; t += step) {
      const v = (Math.sin(t / 37) * 0.5 + 0.5) * (1000 * s) + rand(0, 50) * s;
      points.push([t, String(Math.max(0, v))]);
    }
    return of({ data: { result: [{ metric: {}, values: points }] } });
  }

  telemetryInstant(metric: string): Observable<number> {
    const s = this.scale();
    return of(Math.round(rand(0, 1024 * 10) * s));
  }

  // Diagnostics index mock
  diagnosticsIndex(): Observable<{ path: string; files: string[] }> {
    const now = new Date();
    const files = Array.from({ length: 8 }).map((_, i) => {
      const d = new Date(now.getTime() - i * 1000 * 60 * 60);
      const stamp = d.toISOString().replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z');
      return `diagnostics.${stamp}`;
    });
    return of({ path: '/diagnostics', files });
  }

  // System specs/text mock
  systemSpecsText(): Observable<string> {
    const s = this.scale();
    const lines = [
      `System Specs (mock)` ,
      `CPU: ${Math.round(4 * (1 + s))} cores`,
      `Memory: ${Math.round(8 * (1 + s))} GB`,
      `Disk: ${Math.round(120 * (1 + s))} GB free`,
      `Uptime: ${Math.floor(Math.random() * 48)} hours`,
    ];
    return of(lines.join('\n'));
  }

  // Mock system status object for SystemStatusService
  mockSystemStatus(): Observable<any> {
    const s = this.scale();
    const status = {
      health: s > 0.5 ? 'healthy' : s > 0.1 ? 'degraded' : 'offline',
      lastCheck: new Date(),
      message: undefined,
      services: {
        governance: 'online',
        streaming: 'online'
      }
    };
    return of(status);
  }

  // Mock docker/broker services status for diagnostics view
  mockDockerServices(): Observable<Array<{ name: string; status: string; details?: string; error?: string; latencyMs?: number; icon?: string }>> {
    const services = [
      { name: 'Prometheus', status: Math.random() > 0.15 ? 'online' : 'offline', details: 'http://127.0.0.1:9090', latencyMs: Math.round(Math.random() * 50 + 10), icon: 'monitoring' },
      { name: 'Grafana', status: Math.random() > 0.15 ? 'online' : 'offline', details: 'http://127.0.0.1:3000', latencyMs: Math.round(Math.random() * 80 + 15), icon: 'dashboard' },
      { name: 'Loki', status: Math.random() > 0.2 ? 'online' : 'offline', details: 'http://127.0.0.1:3100', latencyMs: Math.round(Math.random() * 60 + 20), icon: 'description' },
      { name: 'Pulsar', status: Math.random() > 0.15 ? 'online' : 'offline', details: '127.0.0.1:6650', latencyMs: Math.round(Math.random() * 40 + 5), icon: 'cloud_queue' },
      { name: 'Kafka', status: Math.random() > 0.2 ? 'online' : 'offline', details: '127.0.0.1:9092', latencyMs: Math.round(Math.random() * 35 + 8), icon: 'stream' },
      { name: 'RabbitMQ', status: Math.random() > 0.25 ? 'online' : 'offline', details: '127.0.0.1:5672', latencyMs: Math.round(Math.random() * 45 + 12), icon: 'swap_horiz' },
      { name: 'Alertmanager', status: Math.random() > 0.3 ? 'online' : 'offline', details: 'http://127.0.0.1:9093', latencyMs: Math.round(Math.random() * 55 + 18), icon: 'notifications' },
      { name: 'Redis', status: Math.random() > 0.2 ? 'online' : 'offline', details: '127.0.0.1:6379', latencyMs: Math.round(Math.random() * 25 + 3), icon: 'memory' },
    ];
    return of(services);
  }
}

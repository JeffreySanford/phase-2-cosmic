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
  visualizationMetrics(): Observable<{ source: string; data: { throughput: number; errorRate: number; queueDepth: number; sparkline: Array<{ t: number; v: number }>; histogram: number[]; scatter: Array<{ x: number; y: number }> } }> {
    const s = this.scale();
    const now = Date.now();
    const sparkline = Array.from({ length: 40 }).map((_, i) => ({ t: now - (40 - i) * 1000, v: Math.round(rand(20, 80) * s * 10) / 10 }));
    const histogram = Array.from({ length: 10 }).map(() => Math.floor(rand(0, 50) * s));
    const scatter = Array.from({ length: 60 }).map(() => ({ x: Math.random() * 100 * s, y: Math.random() * 100 * s }));
    const throughput = Math.round((sparkline[sparkline.length - 1].v || 0) * 10) / 10;
    return of({ source: 'mock', data: { throughput, errorRate: +(Math.random() * 2).toFixed(2), queueDepth: Math.round(rand(0, 50) * s), sparkline, histogram, scatter } });
  }

  // Telemetry mock: produce Prometheus-like range response with realistic random walk data
  telemetryRange(_metric: string, start: number, end: number, step: number): Observable<unknown> {
    const s = this.scale();
    const points: Array<[number, string]> = [];
    // Generate random walk with trend and noise for more realistic charts
    let value = rand(200, 800) * s;
    const trend = rand(-2, 2) * s; // slight upward or downward trend
    const volatility = rand(20, 80) * s;
    
    for (let t = start; t <= end; t += step) {
      // Random walk: previous value + trend + noise
      value += trend + rand(-volatility, volatility);
      // Occasional spikes/dips
      if (Math.random() < 0.05) {
        value += rand(-200, 200) * s;
      }
      // Keep within reasonable bounds
      value = Math.max(50 * s, Math.min(2000 * s, value));
      points.push([t, String(Math.round(value * 100) / 100)]);
    }
    return of({ data: { result: [{ metric: {}, values: points }] } });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  telemetryInstant(_metric: string): Observable<number> {
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
  mockSystemStatus(): Observable<{ health: 'healthy' | 'degraded' | 'offline'; lastCheck: Date; message: undefined; services: { governance: 'online' | 'offline'; streaming: 'online' | 'offline' } }> {
    const s = this.scale();
    const health: 'healthy' | 'degraded' | 'offline' = s > 0.5 ? 'healthy' : s > 0.1 ? 'degraded' : 'offline';
    const status = {
      health,
      lastCheck: new Date(),
      message: undefined as undefined,
      services: {
        governance: 'online' as const,
        streaming: 'online' as const
      }
    };
    return of(status);
  }

  // Mock docker/broker services status for diagnostics view
  mockDockerServices(): Observable<Array<{ name: string; status: string; details?: string; error?: string; latencyMs?: number; icon?: string }>> {
    const statuses: Array<'healthy' | 'degraded' | 'offline'> = ['healthy', 'healthy', 'healthy', 'healthy', 'degraded', 'offline'];
    const pickStatus = () => statuses[Math.floor(Math.random() * statuses.length)];
    const services = [
      { name: 'Prometheus', status: pickStatus(), details: 'http://127.0.0.1:9090', latencyMs: Math.round(Math.random() * 50 + 10), icon: 'monitoring' },
      { name: 'Grafana', status: pickStatus(), details: 'http://127.0.0.1:3000', latencyMs: Math.round(Math.random() * 80 + 15), icon: 'dashboard' },
      { name: 'Loki', status: pickStatus(), details: 'http://127.0.0.1:3100', latencyMs: Math.round(Math.random() * 60 + 20), icon: 'description' },
      { name: 'Pulsar', status: pickStatus(), details: '127.0.0.1:6650', latencyMs: Math.round(Math.random() * 40 + 5), icon: 'cloud_queue' },
      { name: 'Kafka', status: pickStatus(), details: '127.0.0.1:9092', latencyMs: Math.round(Math.random() * 35 + 8), icon: 'stream' },
      { name: 'RabbitMQ', status: pickStatus(), details: '127.0.0.1:5672', latencyMs: Math.round(Math.random() * 45 + 12), icon: 'swap_horiz' },
      { name: 'Alertmanager', status: pickStatus(), details: 'http://127.0.0.1:9093', latencyMs: Math.round(Math.random() * 55 + 18), icon: 'notifications' },
      { name: 'Redis', status: pickStatus(), details: '127.0.0.1:6379', latencyMs: Math.round(Math.random() * 25 + 3), icon: 'memory' },
    ];
    return of(services);
  }
}

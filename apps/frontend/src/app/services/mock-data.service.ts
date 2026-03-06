import { Injectable } from "@angular/core";
import { of, Observable } from "rxjs";
import { LoadProfileService } from "./load-profile.service";

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

@Injectable({ providedIn: "root" })
export class MockDataService {
  constructor(private loadProfile: LoadProfileService) {}

  private scale(): number {
    const pct = this.loadProfile.current ?? 10;
    // map 10->0.1, 25->0.25, 50->0.5, 100->1.0
    return pct / 100;
  }

  // Topology metrics: return map of linkKey -> { currentMBps, maxMBps }
  topologyMetricsForLinks(
    keys: string[]
  ): Observable<Record<string, { currentMBps: number; maxMBps?: number }>> {
    const s = this.scale();
    const out: Record<string, { currentMBps: number; maxMBps?: number }> = {};
    for (const k of keys) {
      const max = Math.round(rand(50, 500) * s * 10) / 10 + 1;
      const cur = Math.round(max * rand(0.1, 1.0) * 10) / 10;
      out[k] = { currentMBps: cur, maxMBps: max };
    }
    return of(out);
  }

  // Visualization metrics: basic shape for visualization component
  visualizationMetrics(): Observable<{
    source: string;
    data: {
      throughput: number;
      errorRate: number;
      queueDepth: number;
      sparkline: Array<{ t: number; v: number }>;
      histogram: number[];
      scatter: Array<{ x: number; y: number }>;
    };
  }> {
    const s = this.scale();
    const now = Date.now();
    const sparkline = Array.from({ length: 40 }).map((_, i) => ({
      t: now - (40 - i) * 1000,
      v: Math.round(rand(20, 80) * s * 10) / 10,
    }));
    const histogram = Array.from({ length: 10 }).map(() =>
      Math.floor(rand(0, 50) * s)
    );
    const scatter = Array.from({ length: 60 }).map(() => ({
      x: Math.random() * 100 * s,
      y: Math.random() * 100 * s,
    }));
    const throughput =
      Math.round((sparkline[sparkline.length - 1].v || 0) * 10) / 10;
    return of({
      source: "mock",
      data: {
        throughput,
        errorRate: +(Math.random() * 2).toFixed(2),
        queueDepth: Math.round(rand(0, 50) * s),
        sparkline,
        histogram,
        scatter,
      },
    });
  }

  // Telemetry mock: produce Prometheus-like range response with metric-specific behavior.
  telemetryRange(
    metric: string,
    start: number,
    end: number,
    step: number
  ): Observable<unknown> {
    const points = this.buildTelemetrySeries(metric, start, end, step);
    return of({ data: { result: [{ metric: {}, values: points }] } });
  }

  telemetryInstant(metric: string): Observable<number> {
    const end = Math.floor(Date.now() / 15) * 15;
    const start = end - 60;
    const points = this.buildTelemetrySeries(metric, start, end, 15);
    const last = points[points.length - 1];
    return of(last ? Number(last[1]) : 0);
  }

  // Diagnostics index mock
  diagnosticsIndex(): Observable<{ path: string; files: string[] }> {
    const now = new Date();
    const files = Array.from({ length: 8 }).map((_, i) => {
      const d = new Date(now.getTime() - i * 1000 * 60 * 60);
      const stamp = d
        .toISOString()
        .replace(/[:-]/g, "")
        .replace(/\.\d+Z$/, "Z");
      return `diagnostics.${stamp}`;
    });
    return of({ path: "diagnostics logs", files });
  }

  // System specs/text mock
  systemSpecsText(): Observable<string> {
    const s = this.scale();
    const lines = [
      `System Specs (mock)`,
      `CPU: ${Math.round(4 * (1 + s))} cores`,
      `Memory: ${Math.round(8 * (1 + s))} GB`,
      `Disk: ${Math.round(120 * (1 + s))} GB free`,
      `Uptime: ${Math.floor(Math.random() * 48)} hours`,
    ];
    return of(lines.join("\n"));
  }

  // Mock system status object for SystemStatusService
  mockSystemStatus(): Observable<{
    health: "healthy" | "degraded" | "offline";
    lastCheck: Date;
    message: undefined;
    services: {
      governance: "online" | "offline";
      streaming: "online" | "offline";
    };
  }> {
    const s = this.scale();
    const health: "healthy" | "degraded" | "offline" =
      s > 0.5 ? "healthy" : s > 0.1 ? "degraded" : "offline";
    const status = {
      health,
      lastCheck: new Date(),
      message: undefined as undefined,
      services: {
        governance: "online" as const,
        streaming: "online" as const,
      },
    };
    return of(status);
  }

  // Mock docker/broker services status for diagnostics view
  mockDockerServices(): Observable<
    Array<{
      name: string;
      status: string;
      details?: string;
      error?: string;
      latencyMs?: number;
      icon?: string;
    }>
  > {
    const statuses: Array<"healthy" | "degraded" | "offline"> = [
      "healthy",
      "healthy",
      "healthy",
      "healthy",
      "degraded",
      "offline",
    ];
    const pickStatus = () =>
      statuses[Math.floor(Math.random() * statuses.length)];
    const services = [
      {
        name: "Prometheus",
        status: pickStatus(),
        details: "http://127.0.0.1:9090",
        latencyMs: Math.round(Math.random() * 50 + 10),
        icon: "monitoring",
      },
      {
        name: "Grafana",
        status: pickStatus(),
        details: "http://127.0.0.1:3000",
        latencyMs: Math.round(Math.random() * 80 + 15),
        icon: "dashboard",
      },
      {
        name: "Loki",
        status: pickStatus(),
        details: "http://127.0.0.1:3100",
        latencyMs: Math.round(Math.random() * 60 + 20),
        icon: "description",
      },
      {
        name: "Pulsar",
        status: pickStatus(),
        details: "127.0.0.1:6650",
        latencyMs: Math.round(Math.random() * 40 + 5),
        icon: "cloud_queue",
      },
      {
        name: "Kafka",
        status: pickStatus(),
        details: "127.0.0.1:9092",
        latencyMs: Math.round(Math.random() * 35 + 8),
        icon: "stream",
      },
      {
        name: "RabbitMQ",
        status: pickStatus(),
        details: "127.0.0.1:5672",
        latencyMs: Math.round(Math.random() * 45 + 12),
        icon: "swap_horiz",
      },
      {
        name: "Alertmanager",
        status: pickStatus(),
        details: "http://127.0.0.1:9093",
        latencyMs: Math.round(Math.random() * 55 + 18),
        icon: "notifications",
      },
      {
        name: "Redis",
        status: pickStatus(),
        details: "127.0.0.1:6379",
        latencyMs: Math.round(Math.random() * 25 + 3),
        icon: "memory",
      },
    ];
    return of(services);
  }

  private buildTelemetrySeries(
    metric: string,
    start: number,
    end: number,
    step: number
  ): Array<[number, string]> {
    const safeStep = Math.max(step, 1);
    const points: Array<[number, string]> = [];
    const kind = this.metricKind(metric);

    for (let t = start; t <= end; t += safeStep) {
      const value = this.valueForMetric(metric, kind, t);
      points.push([t, value.toFixed(2)]);
    }

    return points;
  }

  private metricKind(
    metric: string
  ):
    | "cpu"
    | "up"
    | "bytes-rate"
    | "bytes-total"
    | "records-rate"
    | "records-total"
    | "generic" {
    const q = metric.toLowerCase();
    if (q.includes("process_cpu_seconds_total") || q.includes("cpu"))
      return "cpu";
    if (q.includes("sum(up)") || q.includes("up{job=") || q === "up")
      return "up";
    if (q.includes("generator_bytes_produced_total")) {
      return q.includes("rate(") ? "bytes-rate" : "bytes-total";
    }
    if (q.includes("generator_records_produced_total")) {
      return q.includes("rate(") ? "records-rate" : "records-total";
    }
    return "generic";
  }

  private valueForMetric(
    metric: string,
    kind:
      | "cpu"
      | "up"
      | "bytes-rate"
      | "bytes-total"
      | "records-rate"
      | "records-total"
      | "generic",
    tsSec: number
  ): number {
    const profile = this.loadProfile.current ?? 10;
    const phase = this.metricPhase(metric);

    switch (kind) {
      case "cpu":
        return this.cpuPercent(profile, tsSec, phase);
      case "up":
        return this.upValue(metric, profile, tsSec, phase);
      case "bytes-rate":
        return this.rateValue(
          profile,
          tsSec,
          phase,
          2_500_000,
          9_500_000,
          22_000_000,
          44_000_000
        );
      case "records-rate":
        return this.rateValue(
          profile,
          tsSec,
          phase,
          6_000,
          28_000,
          85_000,
          160_000
        );
      case "bytes-total":
        return this.counterValue(
          profile,
          tsSec,
          phase,
          320_000_000,
          1_300_000_000,
          4_600_000_000,
          11_500_000_000
        );
      case "records-total":
        return this.counterValue(
          profile,
          tsSec,
          phase,
          850_000,
          4_200_000,
          14_500_000,
          31_000_000
        );
      default:
        return this.genericValue(profile, tsSec, phase);
    }
  }

  private cpuPercent(profile: number, tsSec: number, phase: number): number {
    const band: Record<number, { base: number; amplitude: number }> = {
      10: { base: 14, amplitude: 4 },
      25: { base: 34, amplitude: 6 },
      50: { base: 63, amplitude: 7 },
      100: { base: 95, amplitude: 2.5 },
    };
    const selected = band[profile] ?? band[10];
    const waveA = Math.sin(tsSec / 24 + phase) * selected.amplitude;
    const waveB =
      Math.cos(tsSec / 11 + phase / 2) * (selected.amplitude * 0.35);
    return Math.max(0, Math.min(100, selected.base + waveA + waveB));
  }

  private upValue(
    metric: string,
    _profile: number,
    tsSec: number,
    phase: number
  ): number {
    const q = metric.toLowerCase();
    if (q.includes("sum(up)")) {
      return 7 + (Math.sin(tsSec / 60 + phase) > 0.96 ? -1 : 0);
    }
    return Math.sin(tsSec / 90 + phase) > 0.985 ? 0 : 1;
  }

  private rateValue(
    profile: number,
    tsSec: number,
    phase: number,
    v10: number,
    v25: number,
    v50: number,
    v100: number
  ): number {
    const baseByProfile: Record<number, number> = {
      10: v10,
      25: v25,
      50: v50,
      100: v100,
    };
    const base = baseByProfile[profile] ?? v10;
    const wave =
      1 +
      Math.sin(tsSec / 18 + phase) * 0.08 +
      Math.cos(tsSec / 43 + phase) * 0.04;
    return Math.max(0, base * wave);
  }

  private counterValue(
    profile: number,
    tsSec: number,
    phase: number,
    v10: number,
    v25: number,
    v50: number,
    v100: number
  ): number {
    const baseByProfile: Record<number, number> = {
      10: v10,
      25: v25,
      50: v50,
      100: v100,
    };
    const base = baseByProfile[profile] ?? v10;
    const age = Math.max(0, tsSec - 1_700_000_000);
    const wobble = 1 + Math.sin(tsSec / 120 + phase) * 0.015;
    return Math.max(0, base + age * (base * 0.015) * wobble);
  }

  private genericValue(profile: number, tsSec: number, phase: number): number {
    const scale = Math.max(1, profile);
    return Math.max(
      0,
      scale * 12 +
        Math.sin(tsSec / 21 + phase) * scale * 1.8 +
        Math.cos(tsSec / 8 + phase) * scale * 0.7
    );
  }

  private metricPhase(metric: string): number {
    const hash = Array.from(metric).reduce(
      (acc, char) => acc + char.charCodeAt(0),
      0
    );
    return (hash % 360) * (Math.PI / 180);
  }

  getPulsarStatus(): Observable<{
    brokers: number;
    topics: number;
    partitions: number;
    status: string;
    lastUpdated: string;
  }> {
    const status = {
      brokers: 1,
      topics: Math.floor(Math.random() * 10) + 5,
      partitions: Math.floor(Math.random() * 20) + 10,
      status: Math.random() > 0.1 ? "healthy" : "degraded",
      lastUpdated: new Date().toISOString(),
    };
    return of(status);
  }
}

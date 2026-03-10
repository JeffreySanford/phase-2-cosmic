import { HttpClient } from "@angular/common/http";
import { Component, OnDestroy, OnInit } from "@angular/core";
import { Observable, Subscription, forkJoin, of, timer } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import {
  LoadProfilePct,
  LoadProfileService,
} from "../../services/load-profile.service";
import { TelemetryService } from "../../services/telemetry.service";
import { DataSourceService } from "../../services/data-source.service";
import { MockDataService } from "../../services/mock-data.service";
import { InfrastructureTelemetrySnapshot } from "../../shared/types";

type SourceLabel = "live" | "fallback";

interface ProbeResult<T> {
  ok: boolean;
  value: T;
}

interface MetricTile {
  title: string;
  value: string;
  note: string;
  source: SourceLabel;
  tone: "mint" | "violet" | "amber" | "rose";
  sparkPath?: string;
}

interface TelemetryTile {
  title: string;
  value: string;
  query: string;
  metricId: string;
  source: SourceLabel;
  intensity: number;
}

interface AlertItem {
  level: "critical" | "warning" | "info";
  message: string;
}

interface HeaderKpi {
  label: string;
  value: string;
  tone: "mint" | "violet" | "amber" | "rose";
}

interface DiagnosticsIndex {
  path: string;
  files: string[];
}

type PrometheusRangeResponseLocal = {
  data?: { result?: { values?: Array<[number | string, string]> }[] };
};

@Component({
  selector: "app-dashboard",
  templateUrl: "./dashboard.component.html",
  styleUrls: ["./dashboard.component.scss"],
  standalone: false,
})
export class DashboardComponent implements OnInit, OnDestroy {
  loading = false;
  lastUpdated: Date | null = null;
  profilePct: LoadProfilePct = 10;
  pollingMs = 30000;

  widgetMode: "runtime" | "scaffold" = "runtime";

  systemTiles: MetricTile[] = [];
  telemetryTiles: TelemetryTile[] = [];
  alerts: AlertItem[] = [];
  headerKpis: HeaderKpi[] = [];
  cpuLoadPct = 0;
  bytesRateValue = 0;
  recordsRateValue = 0;
  totalBytesValue = 0;
  healthScore = 0;
  systemEnergy = 0;
  signalBands: Array<{
    label: string;
    value: number;
    tone: "mint" | "violet" | "amber" | "rose";
  }> = [];

  diagnosticsSummary = {
    systemSpecsPresent: false,
    artifactCount: 0,
    fioCount: 0,
    iperfCount: 0,
    latestArtifact: "n/a",
    source: "fallback" as SourceLabel,
  };

  generatorStatus = {
    scrapeUp: false,
    targetsUp: 0,
    lastSeen: "n/a",
    source: "fallback" as SourceLabel,
  };

  governanceSummary = {
    completedTotal: 0,
    failedTotal: 0,
    redisReadRate: "0.00 req/s",
    objectWriteRate: "0.00 req/s",
    pulsarIngestRate: "0.00 req/s",
    proxyRate: "0.00 req/s",
    source: "fallback" as SourceLabel,
  };

  readonly quickLinks = [
    { label: "Open Telemetry", route: "/telemetry" },
    { label: "Open Diagnostics", route: "/diagnostics" },
    { label: "Open Topology", route: "/topology" },
    { label: "Open Visualization", route: "/visualization" },
  ];

  private readonly sub = new Subscription();

  constructor(
    private readonly telemetry: TelemetryService,
    private readonly loadProfile: LoadProfileService,
    private readonly http: HttpClient,
    private readonly dataSource: DataSourceService,
    private readonly mock: MockDataService
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.loadProfile.profile$.subscribe((pct) => {
        this.profilePct = pct;
        this.pollingMs = this.pollingMsFor(pct);
      })
    );

    this.sub.add(
      this.loadProfile.pollingMs$
        .pipe(switchMap((ms) => timer(0, ms)))
        .subscribe(() => this.refresh())
    );

    // Refresh immediately when data source mode changes (live <-> mock)
    this.sub.add(this.dataSource.mode$.subscribe(() => this.refresh()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  refresh(): void {
    this.loading = true;

    const cpuLoad$ = this.probe(
      this.telemetry.queryInstant(
        '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))'
      ),
      0
    );
    const targetsUp$ = this.probe(this.telemetry.queryInstant("sum(up)"), 0);
    const generatorUp$ = this.probe(
      this.telemetry.queryInstant('up{job="data-generator"}'),
      0
    );
    const bytesRate$ = this.probe(
      this.telemetry.queryInstant("rate(generator_bytes_produced_total[1m])"),
      0
    );
    const recordsRate$ = this.probe(
      this.telemetry.queryInstant("rate(generator_records_produced_total[1m])"),
      0
    );
    const totalBytes$ = this.probe(
      this.telemetry.queryInstant("generator_bytes_produced_total"),
      0
    );
    const diagnostics$ =
      this.dataSource.mode === "mock"
        ? this.probe(
            this.mock.diagnosticsIndex() as unknown as Observable<DiagnosticsIndex>,
            { path: "", files: [] as string[] }
          )
        : this.probe(this.http.get<DiagnosticsIndex>("/api/diagnostics"), {
            path: "",
            files: [] as string[],
          });
    const infrastructure$ = this.probe(
      this.http.get<InfrastructureTelemetrySnapshot>(
        "/api/v1/telemetry/infrastructure"
      ),
      {
        measuredAt: "",
        source: "unavailable",
        services: {
          redis: { source: "unavailable" },
          rabbitmq: { source: "unavailable" },
          minio: { source: "unavailable" },
          nginx: { source: "unavailable" },
          frontendSsr: { source: "unavailable" },
          kafka: { source: "unavailable" },
          javaIngest: { source: "unavailable" },
          pulsar: { source: "unavailable" },
          grafana: { source: "unavailable" },
          loki: { source: "unavailable" },
          alertmanager: { source: "unavailable" },
          governanceRuntime: { source: "unavailable" },
        },
      }
    );
    const cpuRange$ = this.probe(
      this.telemetry.queryRange(
        '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))',
        Math.floor(Date.now() / 1000) - 300,
        Math.floor(Date.now() / 1000),
        15
      ),
      {} as unknown
    );
    const bytesRange$ = this.probe(
      this.telemetry.queryRange(
        "rate(generator_bytes_produced_total[1m])",
        Math.floor(Date.now() / 1000) - 300,
        Math.floor(Date.now() / 1000),
        15
      ),
      {} as unknown
    );
    const targetsRange$ = this.probe(
      this.telemetry.queryRange(
        "sum(up)",
        Math.floor(Date.now() / 1000) - 300,
        Math.floor(Date.now() / 1000),
        15
      ),
      {} as unknown
    );

    this.sub.add(
      forkJoin({
        cpuLoad: cpuLoad$,
        targetsUp: targetsUp$,
        generatorUp: generatorUp$,
        bytesRate: bytesRate$,
        recordsRate: recordsRate$,
        totalBytes: totalBytes$,
        diagnostics: diagnostics$,
        infrastructure: infrastructure$,
        cpuRange: cpuRange$,
        bytesRange: bytesRange$,
        targetsRange: targetsRange$,
      }).subscribe((snapshot) => {
        const liveCore =
          snapshot.cpuLoad.ok &&
          snapshot.targetsUp.ok &&
          snapshot.generatorUp.ok &&
          snapshot.bytesRate.ok &&
          snapshot.diagnostics.ok;
        this.widgetMode = liveCore ? "runtime" : "scaffold";

        const files = (snapshot.diagnostics.value.files || []).filter(
          (f) => f !== ".gitkeep"
        );
        const latest = files.length ? files.slice().sort().reverse()[0] : "n/a";
        const fioCount = files.filter((f) => /^fio-/i.test(f)).length;
        const iperfCount = files.filter((f) => /^iperf3-/i.test(f)).length;
        const specsPresent = files.includes("system-specs.txt");

        const cpuSeries = this.extractRangeValues(snapshot.cpuRange.value);
        const bytesSeries = this.extractRangeValues(snapshot.bytesRange.value);
        const targetsSeries = this.extractRangeValues(
          snapshot.targetsRange.value
        );

        this.systemTiles = [
          {
            title: "System CPU Load",
            value: `${Math.max(0, snapshot.cpuLoad.value).toFixed(2)}%`,
            note: "process_cpu_seconds_total (1m rate)",
            source: snapshot.cpuLoad.ok ? "live" : "fallback",
            tone: this.cpuTone(snapshot.cpuLoad.value),
            sparkPath: this.sparkPath(cpuSeries, 140, 30),
          },
          {
            title: "Prometheus Targets Up",
            value: String(Math.max(0, Math.round(snapshot.targetsUp.value))),
            note: "sum(up)",
            source: snapshot.targetsUp.ok ? "live" : "fallback",
            tone: snapshot.targetsUp.value > 0 ? "violet" : "rose",
            sparkPath: this.sparkPath(targetsSeries, 140, 30),
          },
          {
            title: "Generator Scrape",
            value: snapshot.generatorUp.value >= 1 ? "Healthy" : "Down",
            note: 'up{job="data-generator"}',
            source: snapshot.generatorUp.ok ? "live" : "fallback",
            tone: snapshot.generatorUp.value >= 1 ? "mint" : "rose",
            sparkPath: this.sparkPath(targetsSeries, 140, 30),
          },
          {
            title: "Ingest Throughput",
            value: this.formatBytesPerSecond(snapshot.bytesRate.value),
            note: "rate(generator_bytes_produced_total[1m])",
            source: snapshot.bytesRate.ok ? "live" : "fallback",
            tone: snapshot.bytesRate.value > 0 ? "amber" : "violet",
            sparkPath: this.sparkPath(bytesSeries, 140, 30),
          },
        ];

        const ingestIntensity = this.normalize(
          snapshot.bytesRate.value,
          0,
          1024 * 300
        );
        const recordsIntensity = this.normalize(
          snapshot.recordsRate.value,
          0,
          800
        );
        const totalIntensity = this.normalize(
          snapshot.totalBytes.value,
          0,
          1024 * 1024 * 1024
        );
        this.telemetryTiles = [
          {
            title: "Ingest Rate (1m)",
            value: this.formatBytesPerSecond(snapshot.bytesRate.value),
            query: "rate(generator_bytes_produced_total[1m])",
            metricId: "generator_bytes_produced_total",
            source: snapshot.bytesRate.ok ? "live" : "fallback",
            intensity: ingestIntensity,
          },
          {
            title: "Records Rate (1m)",
            value: `${Math.max(0, snapshot.recordsRate.value).toFixed(
              2
            )} rec/s`,
            query: "rate(generator_records_produced_total[1m])",
            metricId: "generator_records_produced_total",
            source: snapshot.recordsRate.ok ? "live" : "fallback",
            intensity: recordsIntensity,
          },
          {
            title: "Total Bytes",
            value: new Intl.NumberFormat().format(
              Math.round(Math.max(0, snapshot.totalBytes.value))
            ),
            query: "generator_bytes_produced_total",
            metricId: "generator_bytes_produced_total",
            source: snapshot.totalBytes.ok ? "live" : "fallback",
            intensity: totalIntensity,
          },
          {
            title: "System Load",
            value: `${Math.max(0, snapshot.cpuLoad.value).toFixed(2)}%`,
            query:
              '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))',
            metricId: "system_cpu_load_pct",
            source: snapshot.cpuLoad.ok ? "live" : "fallback",
            intensity: this.normalize(snapshot.cpuLoad.value, 0, 100),
          },
        ];

        this.diagnosticsSummary = {
          systemSpecsPresent: specsPresent,
          artifactCount: files.length,
          fioCount,
          iperfCount,
          latestArtifact: latest,
          source: snapshot.diagnostics.ok ? "live" : "fallback",
        };

        this.generatorStatus = {
          scrapeUp: snapshot.generatorUp.value >= 1,
          targetsUp: Math.max(0, Math.round(snapshot.targetsUp.value)),
          lastSeen:
            snapshot.generatorUp.value >= 1
              ? new Date().toLocaleTimeString()
              : "n/a",
          source:
            snapshot.generatorUp.ok && snapshot.targetsUp.ok
              ? "live"
              : "fallback",
        };

        const governanceRuntime =
          snapshot.infrastructure.value.services.governanceRuntime;
        const frontendSsr = snapshot.infrastructure.value.services.frontendSsr;
        this.governanceSummary = {
          completedTotal: Math.max(
            0,
            Math.round(governanceRuntime?.completedTotal ?? 0)
          ),
          failedTotal: Math.max(
            0,
            Math.round(governanceRuntime?.failedTotal ?? 0)
          ),
          redisReadRate: this.formatRequestsPerSecond(
            governanceRuntime?.redisReadRatePerSec ?? 0
          ),
          objectWriteRate: this.formatRequestsPerSecond(
            governanceRuntime?.objectWriteRatePerSec ?? 0
          ),
          pulsarIngestRate: this.formatRequestsPerSecond(
            governanceRuntime?.pulsarIngestReceiveRatePerSec ?? 0
          ),
          proxyRate: this.formatRequestsPerSecond(
            frontendSsr?.governanceProxyRatePerSec ?? 0
          ),
          source:
            snapshot.infrastructure.ok &&
            (governanceRuntime?.source === "prometheus" ||
              frontendSsr?.source === "prometheus")
              ? "live"
              : "fallback",
        };

        this.alerts = this.buildAlerts(
          snapshot.cpuLoad.value,
          snapshot.bytesRate.value,
          snapshot.generatorUp.value,
          files.length
        );
        this.cpuLoadPct = this.clamp(snapshot.cpuLoad.value, 0, 100);
        this.bytesRateValue = Math.max(0, snapshot.bytesRate.value);
        this.recordsRateValue = Math.max(0, snapshot.recordsRate.value);
        this.totalBytesValue = Math.max(0, snapshot.totalBytes.value);
        this.healthScore = this.clamp(
          Math.round(
            (snapshot.generatorUp.value >= 1 ? 34 : 6) +
              this.normalize(100 - this.cpuLoadPct, 0, 100) * 34 +
              this.normalize(this.bytesRateValue, 0, 1024 * 300) * 18 +
              this.normalize(files.length, 0, 12) * 14
          ),
          0,
          100
        );
        this.systemEnergy = this.clamp(
          Math.round(
            this.normalize(this.bytesRateValue, 0, 1024 * 300) * 62 +
              this.normalize(this.recordsRateValue, 0, 900) * 38
          ),
          0,
          100
        );
        this.signalBands = [
          {
            label: "Telemetry Throughput",
            value: this.clamp(Math.round(ingestIntensity * 100), 0, 100),
            tone: "violet",
          },
          {
            label: "Pipeline Velocity",
            value: this.clamp(Math.round(recordsIntensity * 100), 0, 100),
            tone: "mint",
          },
          {
            label: "System Headroom",
            value: this.clamp(Math.round(100 - this.cpuLoadPct), 0, 100),
            tone: "amber",
          },
          {
            label: "Operational Health",
            value: this.healthScore,
            tone: "rose",
          },
        ];
        const criticals = this.alerts.filter(
          (a) => a.level === "critical"
        ).length;
        const warnings = this.alerts.filter(
          (a) => a.level === "warning"
        ).length;
        this.headerKpis = [
          {
            label: "CPU Load",
            value: `${this.cpuLoadPct.toFixed(0)}%`,
            tone: this.cpuTone(this.cpuLoadPct),
          },
          {
            label: "Ingest Rate",
            value: this.formatBytesPerSecond(this.bytesRateValue),
            tone: "violet",
          },
          {
            label: "Health Score",
            value: `${this.healthScore}%`,
            tone: this.healthScore >= 70 ? "mint" : "amber",
          },
          {
            label: "Alerts",
            value: `${criticals}/${warnings}`,
            tone: criticals > 0 ? "rose" : warnings > 0 ? "amber" : "mint",
          },
        ];

        this.lastUpdated = new Date();
        this.loading = false;
      })
    );
  }

  private buildAlerts(
    cpuLoad: number,
    bytesRate: number,
    generatorUp: number,
    artifactCount: number
  ): AlertItem[] {
    const items: AlertItem[] = [];
    if (generatorUp < 1) {
      items.push({
        level: "critical",
        message: 'Generator scrape is down (up{job="data-generator"} < 1).',
      });
    }
    if (cpuLoad > 85) {
      items.push({
        level: "warning",
        message: `System CPU load is high at ${cpuLoad.toFixed(2)}%.`,
      });
    }
    if (bytesRate < 1024) {
      items.push({
        level: "warning",
        message:
          "Throughput is low (< 1 KB/s). Verify generator rate and sinks.",
      });
    }
    if (artifactCount === 0) {
      items.push({
        level: "info",
        message: "No diagnostics artifacts found yet. Run passive diagnostics.",
      });
    }
    if (items.length === 0) {
      items.push({
        level: "info",
        message: "No active warnings. Core telemetry signals are healthy.",
      });
    }
    return items;
  }

  private probe<T>(
    source$: Observable<T>,
    fallback: T
  ): Observable<ProbeResult<T>> {
    return source$.pipe(
      map((value: T): ProbeResult<T> => ({ ok: true, value })),
      catchError(() => of<ProbeResult<T>>({ ok: false, value: fallback }))
    );
  }

  private pollingMsFor(pct: LoadProfilePct): number {
    switch (pct) {
      case 10:
        return 30000;
      case 25:
        return 15000;
      case 50:
        return 5000;
      case 100:
        return 1000;
      default:
        return 5000;
    }
  }

  private formatBytesPerSecond(v: number): string {
    if (!isFinite(v) || v <= 0) return "0 B/s";
    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let value = v;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx++;
    }
    return `${value.toFixed(2)} ${units[idx]}`;
  }

  private formatRequestsPerSecond(v: number): string {
    return `${Math.max(0, v).toFixed(2)} req/s`;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  private normalize(v: number, min: number, max: number): number {
    if (!isFinite(v) || max <= min) return 0;
    return this.clamp((v - min) / (max - min), 0, 1);
  }

  private cpuTone(cpu: number): "mint" | "violet" | "amber" | "rose" {
    if (cpu >= 85) return "rose";
    if (cpu >= 65) return "amber";
    if (cpu >= 35) return "violet";
    return "mint";
  }

  ringStyle(value: number): string {
    const pct = this.clamp(Math.round(value), 0, 100);
    return `conic-gradient(from -90deg, #00d4ff 0 ${pct * 0.5}%, #6b7aff ${
      pct * 0.8
    }%, #19d3a2 ${pct}%, rgba(255,255,255,0.08) ${pct}% 100%)`;
  }

  private extractRangeValues(res: unknown): number[] {
    try {
      const r = res as PrometheusRangeResponseLocal;
      const vals = r?.data?.result?.[0]?.values ?? [];
      return vals.map((v) => Number(v[1]) || 0);
    } catch {
      return [];
    }
  }

  private sparkPath(points: number[], w: number, h: number): string {
    if (!points?.length) return "";
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const step = w / Math.max(points.length - 1, 1);
    return points
      .map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }
}

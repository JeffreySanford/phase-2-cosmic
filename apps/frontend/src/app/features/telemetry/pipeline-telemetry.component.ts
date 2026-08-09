import { CommonModule } from "@angular/common";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { Subscription, forkJoin, of, timer } from "rxjs";
import { catchError, map } from "rxjs/operators";

type EvidenceSource =
  | "prometheus"
  | "admin"
  | "live"
  | "unavailable"
  | "mock"
  | "fallback"
  | string;

type InfraService = {
  source?: EvidenceSource;
  status?: string;
  egressBytesPerSec?: number;
  ingressBytesPerSec?: number;
  recordsPerSec?: number;
  brokers?: number;
  topics?: number;
  consumerLag?: number;
  receiveRatePerSec?: number;
  processedRatePerSec?: number;
  validationFailureRatePerSec?: number;
  failureRatePerSec?: number;
  retryRatePerSec?: number;
  dlqRatePerSec?: number;
  kafkaIngestReceiveRatePerSec?: number;
  kafkaIngestSuccessRatePerSec?: number;
  kafkaIngestValidationFailureRatePerSec?: number;
  kafkaIngestDlqRatePerSec?: number;
  rabbitIngestReceiveRatePerSec?: number;
  pulsarIngestReceiveRatePerSec?: number;
};

type InfrastructureSnapshot = {
  measuredAt?: string;
  source?: EvidenceSource;
  cache?: {
    state?: "warming" | "ready" | "stale" | "error" | string;
    refreshedAt?: string;
    failedAt?: string;
    collectionDurationMs?: number;
    refreshIntervalMs?: number;
    lastError?: string;
  };
  services?: {
    dataGenerator?: InfraService;
    kafka?: InfraService;
    javaIngest?: InfraService;
    governanceRuntime?: InfraService;
    [key: string]: InfraService | undefined;
  };
};

type LakehouseSummary = {
  source?: "live" | "fallback" | string;
  evidence?: string;
  upstream?: {
    kind?: string;
    endpoint?: string;
    query?: string;
    rowCount?: number;
  };
  persistedAt?: string;
  freshness?: {
    stale?: boolean;
    lastUpdatedAt?: string;
    maxAgeMs?: number;
  };
};

type AlertSlo = {
  alertIngestedTotal?: number;
  alertLatencyMsP50?: number;
  alertLatencyMsP95?: number;
  alertLatencyMsP99?: number;
  dlqDepth?: number;
  replaysTotal?: number;
  measuredAt?: string;
};

type DlqAlert = {
  id: string;
  eventType?: string;
  severity?: string;
  sourceSystem?: string;
  message?: string;
  issuedAt?: string;
};

type PrometheusPoint = { t: number; v: number };
type SegmentRate = {
  name: "main" | "lbl" | "sba";
  expectedPct: number;
  actualPct: number;
  bytesPerSec: number;
};

type PrometheusQueryResult = {
  metric?: Record<string, string>;
  value?: [number, string];
  values?: Array<[number, string]>;
};

type PrometheusResponse = {
  status?: string;
  data?: { result?: PrometheusQueryResult[] };
};

@Component({
  selector: "app-pipeline-telemetry",
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTabsModule,
  ],
  templateUrl: "./pipeline-telemetry.component.html",
  styleUrls: ["./pipeline-telemetry.component.scss"],
})
export class PipelineTelemetryComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private refreshSub?: Subscription;

  generatorTargetBytesPerSec = 125_000;
  generatorPayloadBytes = 512;
  readonly prometheusScrapeIntervalSec = 15;
  readonly expectedSegments = [
    { name: "main" as const, weight: 48 },
    { name: "lbl" as const, weight: 24 },
    { name: "sba" as const, weight: 21 },
  ];

  readonly lakehouseStages = [
    {
      name: "Bronze Delta",
      status: "Not implemented",
      detail: "Target: source-faithful event history",
    },
    {
      name: "Silver",
      status: "Not implemented",
      detail: "Target: canonical validation, dedupe and quarantine",
    },
    {
      name: "Gold",
      status: "Not implemented",
      detail: "Target: consumer-ready aggregate",
    },
  ];

  infra: InfrastructureSnapshot | null = null;
  lakehouse: LakehouseSummary | null = null;
  alertSlo: AlertSlo | null = null;
  dlq: DlqAlert[] = [];
  trend: PrometheusPoint[] = [];
  segments: SegmentRate[] = this.buildEmptySegments();
  loading = true;
  refreshing = false;
  loadError: string | null = null;
  lastRefreshAt: Date | null = null;

  ngOnInit(): void {
    this.refreshAll();
    this.refreshSub = timer(15_000, 15_000).subscribe(() =>
      this.refreshAll(false)
    );
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  refreshAll(showSpinner = true): void {
    if (showSpinner) this.refreshing = true;

    forkJoin({
      infra: this.http
        .get<InfrastructureSnapshot>("/api/v1/telemetry/infrastructure")
        .pipe(
          catchError((error) => {
            this.loadError = `Infrastructure telemetry unavailable: ${
              error?.status ?? "request failed"
            }`;
            return of(null);
          })
        ),
      lakehouse: this.http
        .get<LakehouseSummary>("/api/v1/lakehouse/metrics")
        .pipe(catchError(() => of(null))),
      alertSlo: this.http
        .get<AlertSlo>("/api/v1/alerts/slo")
        .pipe(catchError(() => of(null))),
      dlq: this.http
        .get<DlqAlert[]>("/api/v1/alerts/dlq")
        .pipe(catchError(() => of([] as DlqAlert[]))),
      trend: this.queryPrometheusRange(
        "rate(generator_bytes_produced_total[1m])",
        300,
        this.prometheusScrapeIntervalSec
      ),
      segments: this.queryPrometheusInstant(
        "sum(rate(generator_bytes_produced_by_segment_total[1m])) by (array_segment)"
      ),
      targetBytes: this.queryPrometheusScalar(
        "generator_target_bytes_per_second"
      ),
      targetPayload: this.queryPrometheusScalar(
        "generator_target_payload_bytes"
      ),
    }).subscribe(
      ({
        infra,
        lakehouse,
        alertSlo,
        dlq,
        trend,
        segments,
        targetBytes,
        targetPayload,
      }) => {
        this.infra = infra;
        this.lakehouse = lakehouse;
        this.alertSlo = alertSlo;
        this.dlq = dlq;
        this.trend = trend;
        this.segments = this.toSegmentRates(segments);
        if (targetBytes > 0) this.generatorTargetBytesPerSec = targetBytes;
        if (targetPayload > 0) this.generatorPayloadBytes = targetPayload;
        this.lastRefreshAt = new Date();
        this.loading = false;
        this.refreshing = false;
        if (infra) this.loadError = null;
      }
    );
  }

  replayAlert(alertId: string): void {
    this.http
      .post(`/api/v1/alerts/dlq/replay/${encodeURIComponent(alertId)}`, {})
      .subscribe({
        next: () => this.refreshAll(false),
        error: () => {
          this.loadError = `Replay failed for alert ${alertId}`;
        },
      });
  }

  get generator(): InfraService {
    return this.infra?.services?.dataGenerator ?? {};
  }

  get kafka(): InfraService {
    return this.infra?.services?.kafka ?? {};
  }

  get javaIngest(): InfraService {
    return this.infra?.services?.javaIngest ?? {};
  }

  get governance(): InfraService {
    return this.infra?.services?.governanceRuntime ?? {};
  }

  get actualBytesPerSec(): number {
    return Number(this.generator.egressBytesPerSec ?? 0);
  }

  get actualRecordsPerSec(): number {
    return Number(this.generator.recordsPerSec ?? 0);
  }

  get targetAttainmentPct(): number {
    if (!this.generatorTargetBytesPerSec) return 0;
    return Math.max(
      0,
      (this.actualBytesPerSec / this.generatorTargetBytesPerSec) * 100
    );
  }

  get telemetryState(): string {
    return (
      this.infra?.cache?.state ??
      (this.infra?.source === "unavailable" ? "unavailable" : "unknown")
    );
  }

  get telemetryAgeSec(): number | null {
    const raw = this.infra?.cache?.refreshedAt ?? this.infra?.measuredAt;
    if (!raw) return null;
    const value = Date.parse(raw);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.round((Date.now() - value) / 1000));
  }

  get pipelineHealthy(): boolean {
    return (
      this.isMeasured(this.generator.source) &&
      this.isMeasured(this.kafka.source) &&
      this.isMeasured(this.javaIngest.source)
    );
  }

  isMeasured(source?: EvidenceSource): boolean {
    return source === "prometheus" || source === "admin" || source === "live";
  }

  sourceLabel(source?: EvidenceSource): string {
    if (source === "prometheus") return "Measured · Prometheus";
    if (source === "admin") return "Measured · Admin API";
    if (source === "live") return "Live source";
    if (source === "mock") return "Mock · test/demo only";
    if (source === "fallback") return "Fallback evidence";
    return "Unavailable";
  }

  statusClass(source?: EvidenceSource): string {
    if (this.isMeasured(source)) return "measured";
    if (source === "mock") return "mock";
    if (source === "fallback") return "fallback";
    return "unavailable";
  }

  formatRate(value?: number): string {
    if (value == null) return "n/a";
    const v = Number(value);
    if (!Number.isFinite(v)) return "n/a";
    const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    let current = Math.abs(v);
    let unit = 0;
    while (current >= 1024 && unit < units.length - 1) {
      current /= 1024;
      unit++;
    }
    return `${v < 0 ? "-" : ""}${current.toFixed(
      current >= 100 ? 0 : current >= 10 ? 1 : 2
    )} ${units[unit]}`;
  }

  formatNumber(value?: number): string {
    if (value == null) return "n/a";
    const v = Number(value);
    return Number.isFinite(v)
      ? new Intl.NumberFormat().format(Math.round(v * 100) / 100)
      : "n/a";
  }

  formatPercent(value?: number): string {
    if (value == null) return "n/a";
    const v = Number(value);
    return Number.isFinite(v) ? `${v.toFixed(v < 1 ? 2 : 1)}%` : "n/a";
  }

  trendPath(width = 760, height = 180): string {
    if (this.trend.length < 2) return "";
    const { min, span } = this.chartBounds();
    const step = width / Math.max(1, this.trend.length - 1);
    return this.trend
      .map((point, index) => {
        const x = index * step;
        const y = height - ((point.v - min) / span) * (height - 16) - 8;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  targetY(height = 180): number {
    const { min, span } = this.chartBounds();
    return (
      height -
      ((this.generatorTargetBytesPerSec - min) / span) * (height - 16) -
      8
    );
  }

  private chartBounds(): { min: number; span: number } {
    const values = [
      ...this.trend.map((point) => point.v),
      this.generatorTargetBytesPerSec,
      0,
    ];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min, span: Math.max(1, max - min) };
  }

  private queryPrometheusScalar(query: string) {
    return this.queryPrometheusInstant(query).pipe(
      map((results) => Number(results[0]?.value?.[1] ?? 0) || 0)
    );
  }

  private queryPrometheusInstant(query: string) {
    const params = new HttpParams().set("query", query);
    return this.http
      .get("/api/proxy/prometheus", { params, responseType: "text" })
      .pipe(
        map((text) => this.parsePrometheus(text).data?.result ?? []),
        catchError(() => of([] as PrometheusQueryResult[]))
      );
  }

  private queryPrometheusRange(
    query: string,
    rangeSec: number,
    stepSec: number
  ) {
    const end = Math.floor(Date.now() / 1000);
    const start = end - rangeSec;
    const params = new HttpParams()
      .set("query", query)
      .set("start", String(start))
      .set("end", String(end))
      .set("step", String(stepSec));

    return this.http
      .get("/api/proxy/prometheus", { params, responseType: "text" })
      .pipe(
        map((text) => {
          const values =
            this.parsePrometheus(text).data?.result?.[0]?.values ?? [];
          return values.map(([timestamp, value]) => ({
            t: timestamp * 1000,
            v: Number(value) || 0,
          }));
        }),
        catchError(() => of([] as PrometheusPoint[]))
      );
  }

  private parsePrometheus(text: string): PrometheusResponse {
    try {
      return JSON.parse(text) as PrometheusResponse;
    } catch {
      return {};
    }
  }

  private toSegmentRates(results: PrometheusQueryResult[]): SegmentRate[] {
    const observed = new Map<string, number>();
    for (const result of results) {
      const name = result.metric?.["array_segment"];
      const value = Number(result.value?.[1] ?? 0);
      if (name) observed.set(name, Number.isFinite(value) ? value : 0);
    }

    const totalObserved = Array.from(observed.values()).reduce(
      (sum, value) => sum + value,
      0
    );
    const totalWeight = this.expectedSegments.reduce(
      (sum, segment) => sum + segment.weight,
      0
    );

    return this.expectedSegments.map((segment) => {
      const bytesPerSec = observed.get(segment.name) ?? 0;
      return {
        name: segment.name,
        expectedPct: (segment.weight / totalWeight) * 100,
        actualPct: totalObserved > 0 ? (bytesPerSec / totalObserved) * 100 : 0,
        bytesPerSec,
      };
    });
  }

  private buildEmptySegments(): SegmentRate[] {
    const totalWeight = this.expectedSegments.reduce(
      (sum, segment) => sum + segment.weight,
      0
    );
    return this.expectedSegments.map((segment) => ({
      name: segment.name,
      expectedPct: (segment.weight / totalWeight) * 100,
      actualPct: 0,
      bytesPerSec: 0,
    }));
  }
}

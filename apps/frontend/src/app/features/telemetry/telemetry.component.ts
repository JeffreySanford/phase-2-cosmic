import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
  inject,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { TelemetryService } from "../../services/telemetry.service";
import { VoService, VoServices } from "../../services/vo.service";
import { BrowserPlatformService } from "../../services/browser-platform.service";
import { BehaviorSubject, Subscription, timer, NEVER, from, of, forkJoin } from "rxjs";
import { switchMap, map, catchError } from "rxjs/operators";
import { LoadProfileService } from "../../services/load-profile.service";
import { TelemetryChartService } from "../../services/telemetry-chart.service";
import {
  InfrastructureTelemetrySnapshot,
  InfraTelemetryServiceMetrics,
  RabbitMQStatus,
  PulsarStatus,
  AlertSloMetrics,
} from "../../shared/types";

// Prometheus range value is [timestamp, value-as-string]
type PrometheusRangeValue = [number, string];
type PrometheusRangeResult = {
  metric: Record<string, string>;
  values: PrometheusRangeValue[];
};
type PrometheusRangeResponse = { data?: { result?: PrometheusRangeResult[] } };


type Point = { t: number; v: number };
type MetricKind = "counter" | "gauge";
type MetricFormat = "bytes_per_sec" | "records_per_sec" | "percent";
type MetricOption = {
  id: string;
  label: string;
  rangeQuery: string;
  instantQuery: string;
  kind: MetricKind;
  format: MetricFormat;
};
type SamplePoint = { time: string; valueHuman: string; pct: number };
type VoTableResponse = {
  fields?: string[];
  rows?: unknown[];
  links?: unknown[];
};

export type TransientAlert = {
  id: string;
  eventType: string;
  severity: string;
  sourceSystem: string;
  correlationId: string;
  message: string;
  issuedAt: string;
  replayed: boolean;
  tags: string[];
};

@Component({
  selector: "app-telemetry",
  templateUrl: "./telemetry.component.html",
  styleUrls: ["./telemetry.component.scss"],

  host: {
    "data-component-id": "telemetry",
  },
  standalone: false,
})
export class TelemetryComponent implements OnInit, AfterViewInit, OnDestroy {
  private telemetry = inject<TelemetryService>(TelemetryService);
  private loadProfile = inject<LoadProfileService>(LoadProfileService);
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  voService = inject(VoService);
  private browser = inject(BrowserPlatformService);
  private chart = inject(TelemetryChartService);

  @ViewChild("chart") chartEl?: ElementRef<HTMLDivElement>;
  @ViewChild("hist") histEl?: ElementRef<HTMLDivElement>;
  @ViewChild("gauge", { static: true }) gaugeEl!: ElementRef<HTMLDivElement>;

  // BehaviorSubjects to control polling and time range from the UI
  pollIntervalMs$ = new BehaviorSubject<number>(5000); // default 5s
  timeRangeSec$ = new BehaviorSubject<number>(300); // default 5m
  readonly metricOptions: MetricOption[] = [
    {
      id: "generator_bytes_produced_total",
      label: "Bytes produced (total)",
      rangeQuery: "generator_bytes_produced_total",
      instantQuery: "generator_bytes_produced_total",
      kind: "counter",
      format: "bytes_per_sec",
    },
    {
      id: "generator_records_produced_total",
      label: "Records produced",
      rangeQuery: "generator_records_produced_total",
      instantQuery: "generator_records_produced_total",
      kind: "counter",
      format: "records_per_sec",
    },
    {
      id: "system_cpu_load_pct",
      label: "System",
      rangeQuery:
        '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))',
      instantQuery:
        '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))',
      kind: "gauge",
      format: "percent",
    },
  ];

  metric$ = new BehaviorSubject<string>(this.metricOptions[0].id);

  // Current metric values exposed via subjects to avoid expression-changed errors
  currentValue$ = new BehaviorSubject<number>(0);
  get currentValue(): number {
    return this.currentValue$.value;
  }

  currentRate = 0; // in units per second (matches metric units, e.g., bytes/sec)

  currentRateHuman$ = new BehaviorSubject<string>("0 B/s");
  get currentRateHuman(): string {
    return this.currentRateHuman$.value;
  }
  points: Array<{ t: number; v: number }> = [];

  // prototype status data for Pulsar component -- wrapped in subjects to avoid
  // change-detection races when the values flip while the template is being
  // checked. Getters expose the current value for existing tests and code.
  readonly pulsarStatus$ = new BehaviorSubject<PulsarStatus>({
    brokers: 0,
    topics: 0,
    partitions: 0,
  });
  get pulsarStatus(): PulsarStatus {
    return this.pulsarStatus$.value;
  }

  readonly rabbitMQStatus$ = new BehaviorSubject<RabbitMQStatus>({
    status: "unknown",
    connection: "unknown",
    queues: {},
    exchanges: {},
  });
  get rabbitMQStatus(): RabbitMQStatus {
    return this.rabbitMQStatus$.value;
  }

  // infrastructure snapshot guarded by subject; tests still assign via setter
  private readonly infrastructureTelemetry$ =
    new BehaviorSubject<InfrastructureTelemetrySnapshot | null>(null);
  get infrastructureTelemetry(): InfrastructureTelemetrySnapshot | null {
    return this.infrastructureTelemetry$.value;
  }
  set infrastructureTelemetry(v: InfrastructureTelemetrySnapshot | null) {
    this.infrastructureTelemetry$.next(v);
  }

  public readonly lastUpdated$ = new BehaviorSubject<number | null>(null);
  get lastUpdated(): number | null {
    return this.lastUpdated$.value;
  }

  // Alert SLO state
  readonly alertSlo$ = new BehaviorSubject<AlertSloMetrics | null>(null);
  get alertSlo(): AlertSloMetrics | null {
    return this.alertSlo$.value;
  }

  readonly alertDlq$ = new BehaviorSubject<TransientAlert[]>([]);
  get alertDlq(): TransientAlert[] {
    return this.alertDlq$.value;
  }

  readonly alertSloLoading$ = new BehaviorSubject<boolean>(false);
  get alertSloLoading(): boolean {
    return this.alertSloLoading$.value;
  }
  readonly alertSloError$ = new BehaviorSubject<string | null>(null);
  get alertSloError(): string | null {
    return this.alertSloError$.value;
  }
  stats: { min: number; max: number; avg: number; p95: number } = {
    min: 0,
    max: 0,
    avg: 0,
    p95: 0,
  };
  selectedVizTab = 0;
  recentSamples: Array<{ time: string; valueHuman: string; pct: number }> = [];
  // Prometheus-derived recent samples (kept separate from VO samples)
  prometheusSamples: Array<{ time: string; valueHuman: string; pct: number }> =
    [];
  // VO services metadata (if configured)
  voServices?: VoServices | null = null;
  // raw parsed VO rows (if any)
  voRows: Array<Record<string, string>> = [];
  // Hot observable (BehaviorSubject) that holds the latest VO samples
  voSamples$ = new BehaviorSubject<SamplePoint[]>([]);
  private gaugeCap = 1;

  private pollSub?: Subscription;
  private profileSub?: Subscription;
  private routeSub?: Subscription;
  private stop$ = new BehaviorSubject<boolean>(false);

  private chartInitialized = false;
  private histInitialized = false;
  private gaugeInitialized = false;
  private pollerStarted = false;

  private deferUiUpdate(task: () => void): void {
    setTimeout(task, 0);
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const metric = params.get("metric");
      if (!metric) return;
      const valid = this.metricOptions.some((m) => m.id === metric);
      if (!valid) return;
      if (this.metric$.value !== metric) this.metric$.next(metric);
    });

    this.profileSub = this.loadProfile.profile$.subscribe((pct) => {
      if (pct === 10) this.pollIntervalMs$.next(30000);
      if (pct === 25) this.pollIntervalMs$.next(15000);
      if (pct === 50) this.pollIntervalMs$.next(5000);
      if (pct === 100) this.pollIntervalMs$.next(1000);
    });
    // VO samples are provided by VoService voSamples$ (hot observable)

    // fetch VO service metadata (tap/dataLink urls) when available
    this.voService.getServices().subscribe(
      (s) => {
        this.deferUiUpdate(() => {
          this.voServices = s;
          // wire local observable to service's hot observable so template can async-pipe it
          this.voSamples$ = this.voService.voSamples$;
        });
      },
      () => {
        this.deferUiUpdate(() => {
          this.voServices = null;
        });
      }
    );
  }

  ngAfterViewInit(): void {
    const chartEl = this.chartEl?.nativeElement;
    const histEl = this.histEl?.nativeElement;
    const gaugeEl = this.gaugeEl?.nativeElement;

    const config = {
      lineColor: this.cssVar("--color-accent-2", "#7b61ff"),
      maColor: this.cssVar("--color-accent-1", "#ff6b6b"),
      focusColor: this.cssVar("--color-accent-3", "#00e5ff"),
      histogramColor: this.cssVar("--color-accent-3", "#00e5ff"),
      gaugeColor: this.cssVar("--color-accent-1", "#ff6b6b"),
    };

    forkJoin({
      line: chartEl ? from(this.chart.initLineChart(chartEl, config)) : of(undefined),
      hist: histEl ? from(this.chart.initHistogram(histEl)) : of(undefined),
      gauge: gaugeEl ? from(this.chart.initGauge(gaugeEl, config)) : of(undefined),
    })
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.chartInitialized = true;
        this.histInitialized = true;
        this.gaugeInitialized = true;
        this.ensureVizInitialized();

        // Start data loading after the first render cycle to avoid NG0100 on initial paint.
        this.deferUiUpdate(() => {
          this.fetchAllTelemetry();
          this.startPolling();
        });
      });
  }

  private cssVar(name: string, fallback = ""): string {
    return this.browser.readCssVar(name, fallback);
  }

  private getChartConfig() {
    return {
      lineColor: this.cssVar("--color-accent-2", "#7b61ff"),
      maColor: this.cssVar("--color-accent-1", "#ff6b6b"),
      focusColor: this.cssVar("--color-accent-3", "#00e5ff"),
      histogramColor: this.cssVar("--color-accent-3", "#00e5ff"),
      gaugeColor: this.cssVar("--color-accent-1", "#ff6b6b"),
    };
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.profileSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.stop$.next(true);
    this.stop$.complete();
  }

  private fetchAllTelemetry(): void {
    this.fetchRangeAndRender();
    this.fetchPulsarStatus();
    this.fetchRabbitMQStatus();
    this.fetchInfrastructureTelemetry();
    this.fetchAlertSlo();
  }

  private startPolling(): void {
    if (this.pollerStarted) {
      this.pollSub?.unsubscribe();
    }
    this.pollerStarted = true;
    this.pollSub = this.pollIntervalMs$
      .pipe(switchMap((ms) => (ms > 0 ? timer(ms, ms) : NEVER)))
      .subscribe(() => this.fetchAllTelemetry());
  }

  private fetchRangeAndRender(): void {
    const selectedMetric = this.getSelectedMetric();
    const range = this.timeRangeSec$.value;
    const end = Math.floor(Date.now() / 1000);
    const start = end - range;
    const step = Math.max(Math.floor(range / 120), 1); // ~120 samples
    if (selectedMetric.kind === "counter") {
      this.telemetry
        .queryRangeRate(selectedMetric.rangeQuery, start, end, step, "1m")
        .subscribe((res: unknown) =>
          this.handleRateResponse(res as PrometheusRangeResponse)
        );
      this.telemetry
        .queryInstant(selectedMetric.instantQuery)
        .subscribe((val: unknown) =>
          this.deferUiUpdate(() => {
            this.currentValue$.next(Number(val as unknown as number));
          })
        );
    } else {
      this.telemetry
        .queryRange(selectedMetric.rangeQuery, start, end, step)
        .subscribe((res: unknown) =>
          this.handleRangeResponse(res as PrometheusRangeResponse)
        );
    }

    // Fetch Pulsar status
    this.telemetry.getPulsarStatus().subscribe((status) => {
      this.deferUiUpdate(() => {
        this.pulsarStatus$.next({
          brokers: status.brokers,
          topics: status.topics,
          partitions: status.partitions,
        });
      });
    });
  }

  private handleRateResponse(res: PrometheusRangeResponse): void {
    try {
      const vals = res?.data?.result?.[0]?.values || [];
      this.deferUiUpdate(() => {
        this.points = (vals as PrometheusRangeValue[]).map((v) => ({
          t: v[0] * 1000,
          v: Number(v[1]),
        }));
        this.currentRate = this.points.length
          ? this.points[this.points.length - 1].v
          : 0;
        this.currentRateHuman$.next(this.humanRate(this.currentRate));
        this.lastUpdated$.next(Date.now());
        this.computeStats(this.points.map((p) => p.v));
        const ma = this.points.map((p, i, arr) => {
          const start = Math.max(0, i - 4);
          const slice = arr.slice(start, i + 1);
          return {
            t: p.t,
            v: slice.reduce((s, x) => s + x.v, 0) / slice.length,
          };
        });
        const nextCap = Math.max(
          1,
          Number(this.stats.p95) * 1.15,
          Number(this.stats.max) * 1.05,
          this.currentRate * 1.05
        );
        this.gaugeCap = Math.max(nextCap, this.gaugeCap * 0.9);
        this.updateRecentSamples(this.points);
        this.chart.renderLine(
          this.points,
          ma,
          this.currentRate,
          this.gaugeCap,
          (v) => this.humanRate(v),
          this.getChartConfig()
        );
        this.chart.renderHistogram(
          this.points.map((p) => p.v),
          (v) => this.humanRate(v),
          this.getChartConfig().histogramColor
        );
      });
    } catch {
      // ignore
    }
  }

  // Use a typed d3.line generator instead of constructing path strings manually.
  // This relies on d3's TypeScript types being available in the project.

  private handleRangeResponse(res: PrometheusRangeResponse) {
    try {
      const vals = res?.data?.result?.[0]?.values || [];
      this.deferUiUpdate(() => {
        this.points = (vals as PrometheusRangeValue[]).map((v) => ({
          t: v[0] * 1000,
          v: Number(v[1]),
        }));
        this.currentValue$.next(
          this.points.length ? this.points[this.points.length - 1].v : 0
        );
        this.lastUpdated$.next(Date.now());
        this.computeStats(this.points.map((p) => p.v));
        const ma = this.points.map((p, i, arr) => {
          const start = Math.max(0, i - 4);
          const slice = arr.slice(start, i + 1);
          return {
            t: p.t,
            v: slice.reduce((s, x) => s + x.v, 0) / slice.length,
          };
        });
        this.updateRecentSamples(this.points);
        this.chart.renderLine(
          this.points,
          ma,
          this.currentRate,
          this.gaugeCap,
          (v) => this.humanRate(v),
          this.getChartConfig()
        );
        this.chart.renderHistogram(
          this.points.map((p) => p.v),
          (v) => this.humanRate(v),
          this.getChartConfig().histogramColor
        );
        if (this.getSelectedMetric().kind === "gauge") {
          this.currentRate = this.currentValue;
          this.currentRateHuman$.next(this.humanRate(this.currentRate));
          const nextCap = Math.max(
            1,
            Number(this.stats.p95) * 1.15,
            Number(this.stats.max) * 1.05,
            this.currentRate * 1.05
          );
          this.gaugeCap = Math.max(nextCap, this.gaugeCap * 0.9);
          this.chart.renderGauge(
            this.currentRate,
            this.gaugeCap,
            (v) => this.humanRate(v),
            this.getChartConfig()
          );
        } else {
          this.computeRate(this.points);
        }
      });
    } catch {
      // ignore parse errors
    }
  }



  exportCsv() {
    if (!this.points || this.points.length === 0) return;
    const rows = ["timestamp,value"];
    for (const p of this.points)
      rows.push([new Date(p.t).toISOString(), String(p.v)].join(","));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    this.browser.downloadBlob(blob, "telemetry.csv");
  }

  private computeStats(values: number[]) {
    if (!values || values.length === 0) {
      this.stats = { min: 0, max: 0, avg: 0, p95: 0 };
      return;
    }
    const sorted = values
      .slice()
      .filter(isFinite)
      .sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    const avg = sum / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const idx = Math.floor(0.95 * (sorted.length - 1));
    const p95 = sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
    this.stats = { min, max, avg, p95 };
  }



  private computeRate(points: Array<{ t: number; v: number }>) {
    if (!points || points.length < 2) {
      this.currentRate = 0;
      this.currentRateHuman$.next(this.humanRate(0));
      return;
    }
    // compute per-interval rates (v delta / seconds)
    const rates: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dt = (b.t - a.t) / 1000; // seconds
      if (dt <= 0) continue;
      const dv = b.v - a.v;
      // handle counter reset: if dv < 0, skip
      if (dv < 0) continue;
      rates.push(dv / dt);
    }
    if (rates.length === 0) {
      this.currentRate = 0;
    } else {
      // use simple average of last 3 intervals to smooth
      const window = 3;
      const slice = rates.slice(Math.max(0, rates.length - window));
      const sum = slice.reduce((s, x) => s + x, 0);
      this.currentRate = sum / slice.length;
    }
    this.currentRateHuman$.next(this.humanRate(this.currentRate));
  }

  private humanRate(v: number) {
    const metric = this.getSelectedMetric();
    if (!isFinite(v)) return "0";

    if (metric.format === "percent") {
      return `${v.toFixed(2)}%`;
    }

    if (metric.format === "records_per_sec") {
      return `${v.toFixed(2)} rec/s`;
    }

    if (v === 0) return "0 B/s";
    const abs = Math.abs(v);
    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let i = 0;
    let val = abs;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${v < 0 ? "-" : ""}${val.toFixed(2)} ${units[i]}`;
  }

  // UI interactions
  setPolling(label: string) {
    switch (label) {
      case "live":
        this.pollIntervalMs$.next(1000);
        break;
      case "5s":
        this.pollIntervalMs$.next(5000);
        break;
      case "15s":
        this.pollIntervalMs$.next(15000);
        break;
      case "60s":
        this.pollIntervalMs$.next(60000);
        break;
      case "off":
        this.pollIntervalMs$.next(0);
        break;
    }
  }

  setRangeSec(sec: number) {
    this.timeRangeSec$.next(sec);
  }

  setMetric(m: string) {
    this.metric$.next(m);
    this.gaugeCap = 1;
    this.fetchRangeAndRender();
  }

  onVizTabChanged() {
    setTimeout(() => {
      this.ensureVizInitialized();
      this.fetchRangeAndRender();
      // another tick after the view has fully rendered/animated to pick up
      // any dimension changes that ocurred during tab switch
      setTimeout(() => this.fetchRangeAndRender(), 0);
    }, 0);
  }

  private ensureVizInitialized() {
    const config = this.getChartConfig();

    if (this.selectedVizTab === 0) {
      if (!this.chartInitialized) {
        const chartEl = this.chartEl?.nativeElement;
        if (chartEl) {
          from(this.chart.initLineChart(chartEl, config)).subscribe(() => {
            this.chartInitialized = true;
            this.renderCurrentData(config);
          });
        }
      } else {
        this.renderCurrentData(config);
      }
    }

    if (this.selectedVizTab === 1) {
      if (!this.histInitialized) {
        const histEl = this.histEl?.nativeElement;
        if (histEl) {
          from(this.chart.initHistogram(histEl)).subscribe(() => {
            this.histInitialized = true;
            this.renderHistogramForCurrentData(config);
          });
        }
      } else {
        this.renderHistogramForCurrentData(config);
      }
    }
  }

  private renderCurrentData(config: ReturnType<typeof this.getChartConfig>) {
    if (!this.points?.length) return;

    const ma = this.points.map((p, i, arr) => {
      const start = Math.max(0, i - 4);
      const slice = arr.slice(start, i + 1);
      return {
        t: p.t,
        v: slice.reduce((s, x) => s + x.v, 0) / slice.length,
      };
    });

    this.chart.renderLine(
      this.points,
      ma,
      this.currentRate,
      this.gaugeCap,
      (v) => this.humanRate(v),
      config
    );

    this.chart.renderHistogram(
      this.points.map((p) => p.v),
      (v) => this.humanRate(v),
      config.histogramColor
    );
  }

  private renderHistogramForCurrentData(config: ReturnType<typeof this.getChartConfig>) {
    if (!this.points?.length) return;
    this.chart.renderHistogram(
      this.points.map((p) => p.v),
      (v) => this.humanRate(v),
      config.histogramColor
    );
  }

  private updateRecentSamples(points: Array<{ t: number; v: number }>) {
    if (!points?.length) {
      this.prometheusSamples = [];
      return;
    }
    const max = Math.max(1, ...points.map((p) => p.v));
    this.prometheusSamples = points
      .slice(-12)
      .reverse()
      .map((p) => ({
        time: new Date(p.t).toLocaleTimeString(),
        valueHuman: this.humanRate(p.v),
        pct: Math.min(100, Math.max(0, (p.v / max) * 100)),
      }));
  }

  private getSelectedMetric(): MetricOption {
    return (
      this.metricOptions.find((m) => m.id === this.metric$.value) ??
      this.metricOptions[0]
    );
  }

  get rateCardTitle(): string {
    const selected = this.getSelectedMetric();
    if (selected.format === "percent") return "System Load";
    if (selected.format === "records_per_sec") return "Throughput (records)";
    return "Throughput";
  }

  formatCurrentValue(v: number): string {
    const selected = this.getSelectedMetric();
    if (selected.kind === "counter")
      return new Intl.NumberFormat().format(Math.round(v));
    return this.humanRate(v);
  }

  formatStat(v: number): string {
    return this.humanRate(v);
  }

  private fetchPulsarStatus(): void {
    this.http.get<PulsarStatus>("/api/v1/pulsar/status").subscribe(
      (status: PulsarStatus) => {
        this.deferUiUpdate(() => {
          this.pulsarStatus$.next({
            brokers: status.brokers || 0,
            topics: status.topics || 0,
            partitions: status.partitions || 0,
          });
        });
      },
      () => {
        this.deferUiUpdate(() => {
          this.pulsarStatus$.next({ brokers: 0, topics: 0, partitions: 0 });
        });
      }
    );
  }

  private fetchRabbitMQStatus(): void {
    this.http.get<RabbitMQStatus>("/api/v1/rabbitmq/status").subscribe(
      (status: RabbitMQStatus) => {
        this.deferUiUpdate(() => {
          this.rabbitMQStatus$.next({
            status: status.status || "unknown",
            connection: status.connection || "unknown",
            queues: status.queues || {},
            exchanges: status.exchanges || {},
            error: status.error,
          });
        });
      },
      () => {
        this.deferUiUpdate(() => {
          this.rabbitMQStatus$.next({
            status: "error",
            connection: "error",
            queues: {},
            exchanges: {},
            error: "Connection failed",
          });
        });
      }
    );
  }

  private normalizeInfraSnapshot(
    snapshot: InfrastructureTelemetrySnapshot
  ): InfrastructureTelemetrySnapshot {
    const unavailable: InfraTelemetryServiceMetrics = { source: "unavailable" };
    const svc = snapshot.services ?? {};
    return {
      ...snapshot,
      services: {
        redis:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["redis"] ??
          unavailable,
        rabbitmq:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["rabbitmq"] ??
          unavailable,
        minio:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["minio"] ??
          unavailable,
        nginx:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["nginx"] ??
          unavailable,
        frontendSsr:
          (svc as Record<string, InfraTelemetryServiceMetrics>)[
            "frontendSsr"
          ] ?? unavailable,
        kafka:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["kafka"] ??
          unavailable,
        javaIngest:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["javaIngest"] ??
          unavailable,
        pulsar:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["pulsar"] ??
          unavailable,
        grafana:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["grafana"] ??
          unavailable,
        loki:
          (svc as Record<string, InfraTelemetryServiceMetrics>)["loki"] ??
          unavailable,
        alertmanager:
          (svc as Record<string, InfraTelemetryServiceMetrics>)[
            "alertmanager"
          ] ?? unavailable,
        governanceRuntime:
          (svc as Record<string, InfraTelemetryServiceMetrics>)[
            "governanceRuntime"
          ] ?? unavailable,
      },
    };
  }

  private fetchInfrastructureTelemetry(): void {
    this.http
      .get<InfrastructureTelemetrySnapshot>("/api/v1/telemetry/infrastructure")
      .subscribe(
        (snapshot) => {
          this.deferUiUpdate(() => {
            this.infrastructureTelemetry =
              this.normalizeInfraSnapshot(snapshot);
            const pulsar = snapshot.services.pulsar;
            if (pulsar && pulsar.source !== "unavailable") {
              this.pulsarStatus$.next({
                brokers: Math.round(Number(pulsar.brokers ?? 0)),
                topics: Math.round(Number(pulsar.topics ?? 0)),
                partitions: Math.round(Number(pulsar.partitions ?? 0)),
              });
            }
          });
        },
        () => {
          this.deferUiUpdate(() => {
            this.infrastructureTelemetry = null;
          });
        }
      );
  }

  // Public refresh helpers used by the Overview expansion panels
  refreshPulsarDetails(): void {
    this.fetchPulsarStatus();
  }

  refreshRabbitDetails(): void {
    this.fetchRabbitMQStatus();
  }

  /**
   * Fetch a lightweight VOTable summary from the governance API and map
   * it into the recentSamples format used by the UI. This is defensive:
   * if VO data is not available we simply keep the existing Prometheus samples.
   */
  private fetchVoSamples(): void {
    // Only attempt VO fetch when VO services are configured
    if (
      !this.voServices ||
      (!this.voServices.tapUrl && !this.voServices.dataLinkUrl)
    )
      return;
    const url = "/api/v1/vo/votable?table=chanmaster&position=3c273";
    this.http.get<VoTableResponse>(url).subscribe(
      (res) => {
        const fields = res?.fields || [];
        const rows = res?.rows || [];
        this.voRows = [];
        const parsed: Array<{ time: string; valueHuman: string; pct: number }> =
          [];
        for (const r of rows) {
          let rec: Record<string, string> = {};
          if (Array.isArray(r)) {
            for (let i = 0; i < r.length; i++) {
              const key = fields[i] ?? `col${i}`;
              rec[key] = String(r[i] ?? "");
            }
          } else if (typeof r === "object" && r !== null) {
            rec = Object.fromEntries(
              Object.entries(r).map(([k, v]) => [k, String(v ?? "")])
            );
          }
          this.voRows.push(rec);
        }

        // Heuristic mapping: pick first column as time-like and second as numeric value if present
        const sampleRecs = this.voRows.map((rec) => {
          const keys = Object.keys(rec);
          const timeVal =
            rec["time"] ??
            rec["timestamp"] ??
            (keys.length ? rec[keys[0]] : new Date().toLocaleTimeString());
          const valueRaw =
            rec["value"] ??
            rec["flux"] ??
            rec["mag"] ??
            (keys.length > 1 ? rec[keys[1]] : "0");
          const n = Number(String(valueRaw).replace(/[^0-9.+-eE]/g, "")) || 0;
          return { time: String(timeVal), value: n };
        });

        const max = Math.max(1, ...sampleRecs.map((s) => s.value));
        for (const s of sampleRecs) {
          parsed.push({
            time: s.time,
            valueHuman: this.humanRate(s.value),
            pct: Math.min(100, Math.max(0, (s.value / max) * 100)),
          });
        }

        if (parsed.length) {
          // Publish VO-derived samples to the hot observable instead of overwriting Prometheus samples
          this.voSamples$.next(parsed.slice(0, 50).reverse());
        }
      },
      () => {
        // ignore VO fetch errors
      }
    );
  }

  // convenience getters for template
  // Prometheus sample accessors (used by the Prometheus tile)
  get firstFive(): Array<{ time: string; valueHuman: string; pct: number }> {
    return this.prometheusSamples.slice(0, 5);
  }

  get remainingSamples(): Array<{
    time: string;
    valueHuman: string;
    pct: number;
  }> {
    return this.prometheusSamples.slice(5);
  }

  getRabbitQueuesCount(): number {
    try {
      return Object.keys(this.rabbitMQStatus.queues || {}).length;
    } catch {
      return 0;
    }
  }

  getRabbitExchangesCount(): number {
    try {
      return Object.keys(this.rabbitMQStatus.exchanges || {}).length;
    } catch {
      return 0;
    }
  }

  fetchAlertSlo(): void {
    // avoid toggling booleans mid-change-detection
    this.deferUiUpdate(() => {
      this.alertSloLoading$.next(true);
      this.alertSloError$.next(null);
    });
    this.http.get<AlertSloMetrics>("/api/v1/alerts/slo").subscribe(
      (slo) => {
        this.deferUiUpdate(() => {
          this.alertSlo$.next(slo);
          this.alertSloLoading$.next(false);
        });
      },
      () => {
        this.deferUiUpdate(() => {
          this.alertSloError$.next("Alert SLO endpoint unavailable");
          this.alertSloLoading$.next(false);
        });
      }
    );
    this.http.get<TransientAlert[]>("/api/v1/alerts/dlq").subscribe(
      (dlq) => {
        this.deferUiUpdate(() => {
          this.alertDlq$.next(dlq);
        });
      },
      () => {
        this.deferUiUpdate(() => {
          this.alertDlq$.next([]);
        });
      }
    );
  }

  replayFromDlq(alertId: string): void {
    this.http
      .post<TransientAlert>(`/api/v1/alerts/dlq/replay/${alertId}`, {})
      .subscribe(
        () => {
          this.fetchAlertSlo();
        },
        () => {
          this.alertSloError$.next(`Replay failed for alert ${alertId}`);
        }
      );
  }

  replayAllFromDlq(): void {
    this.http.post<number>("/api/v1/alerts/dlq/replay-all", {}).subscribe(
      () => {
        this.fetchAlertSlo();
      },
      () => {
        this.alertSloError$.next("Replay-all failed");
      }
    );
  }

  formatBytesPerSec(value?: number): string {
    return this.humanRate(Number(value ?? 0));
  }

  formatRequestsPerSec(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)} req/s`;
  }

  formatOpsPerSec(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)} ops/s`;
  }

  formatCount(value?: number): string {
    return new Intl.NumberFormat().format(Math.round(Number(value ?? 0)));
  }

  formatMs(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)} ms`;
  }

  formatPercent(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)}%`;
  }

  infraSourceLabel(source?: string): string {
    if (source === "prometheus") return "Live";
    if (source === "admin") return "Live (Admin API)";
    if (source === "mock") return "Mock";
    return "Unavailable";
  }
}

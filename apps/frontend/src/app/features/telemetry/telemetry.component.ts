import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
  Inject,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { TelemetryService } from "../../services/telemetry.service";
import { VoService, VoServices } from "../../services/vo.service";
import { BehaviorSubject, Subscription, timer, NEVER, from, of } from "rxjs";
import { switchMap, map, catchError } from "rxjs/operators";
import { LoadProfileService } from "../../services/load-profile.service";
import {
  InfrastructureTelemetrySnapshot,
  InfraTelemetryServiceMetrics,
  RabbitMQStatus,
  PulsarStatus,
} from "../../shared/types";

// Prometheus range value is [timestamp, value-as-string]
type PrometheusRangeValue = [number, string];
type PrometheusRangeResult = {
  metric: Record<string, string>;
  values: PrometheusRangeValue[];
};
type PrometheusRangeResponse = { data?: { result?: PrometheusRangeResult[] } };

type D3Module = typeof import("d3");
let _d3: D3Module | null = null;
type D3SVG = ReturnType<D3Module["select"]> | null;
type D3G = ReturnType<D3Module["select"]> | null;

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

type AlertSloMetrics = {
  alertIngestedTotal: number;
  alertLatencyMsP50: number;
  alertLatencyMsP95: number;
  alertLatencyMsP99: number;
  dlqDepth: number;
  replaysTotal: number;
  measuredAt: string;
};

type TransientAlert = {
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
  standalone: false,
  host: {
    "data-component-id": "telemetry",
  },
})
export class TelemetryComponent implements OnInit, AfterViewInit, OnDestroy {
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

  currentValue = 0;
  currentRate = 0; // in units per second (matches metric units, e.g., bytes/sec)
  currentRateHuman = "0 B/s";
  points: Array<{ t: number; v: number }> = [];

  // prototype status data for Pulsar component
  pulsarStatus = { brokers: 0, topics: 0, partitions: 0 };
  rabbitMQStatus: RabbitMQStatus = {
    status: "unknown",
    connection: "unknown",
    queues: {},
    exchanges: {},
  };
  infrastructureTelemetry: InfrastructureTelemetrySnapshot | null = null;
  lastUpdated: number | null = null;

  // Alert SLO state
  alertSlo: AlertSloMetrics | null = null;
  alertDlq: TransientAlert[] = [];
  alertSloLoading = false;
  alertSloError: string | null = null;
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

  private svg: D3SVG | null = null;
  private histSvg: D3SVG | null = null;
  private gaugeSvg: D3SVG | null = null;
  private gaugeGroup: D3G | null = null;
  private d3: D3Module | null = null;

  constructor(
    @Inject(TelemetryService) private telemetry: TelemetryService,
    @Inject(LoadProfileService) private loadProfile: LoadProfileService,
    private route: ActivatedRoute,
    private http: HttpClient,
    public voService: VoService
  ) {}

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
    // When poll interval changes, recreate the polling subscription
    this.pollSub = this.pollIntervalMs$
      .pipe(switchMap((ms) => (ms > 0 ? timer(0, ms) : NEVER)))
      .subscribe(() => {
        this.fetchRangeAndRender();
        this.fetchPulsarStatus();
        this.fetchRabbitMQStatus();
        this.fetchInfrastructureTelemetry();
        this.fetchAlertSlo();
      });

    // VO samples are provided by VoService voSamples$ (hot observable)

    // fetch VO service metadata (tap/dataLink urls) when available
    this.voService.getServices().subscribe(
      (s) => {
        this.voServices = s;
        // wire local observable to service's hot observable so template can async-pipe it
        this.voSamples$ = this.voService.voSamples$;
      },
      () => {
        this.voServices = null;
      }
    );
  }

  ngAfterViewInit(): void {
    this.loadD3().subscribe(() => {
      this.initGauge();
      this.ensureVizInitialized();
    });
  }

  private cssVar(name: string, fallback = ""): string {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(
        name
      );
      return (v || fallback).trim();
    } catch {
      return fallback;
    }
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.profileSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.stop$.next(true);
    this.stop$.complete();
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
        .subscribe(
          (val: unknown) =>
            (this.currentValue = Number(val as unknown as number))
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
      this.pulsarStatus = {
        brokers: status.brokers,
        topics: status.topics,
        partitions: status.partitions,
      };
    });
  }

  private handleRateResponse(res: PrometheusRangeResponse): void {
    try {
      const vals = res?.data?.result?.[0]?.values || [];
      this.points = (vals as PrometheusRangeValue[]).map((v) => ({
        t: v[0] * 1000,
        v: Number(v[1]),
      }));
      // for rate series the point values are already per-second rates
      this.currentRate = this.points.length
        ? this.points[this.points.length - 1].v
        : 0;
      this.currentRateHuman = this.humanRate(this.currentRate);
      this.lastUpdated = Date.now();
      this.computeStats(this.points.map((p) => p.v));
      // compute moving average for smoothing display (use the rate values)
      const ma = this.points.map((p, i, arr) => {
        const start = Math.max(0, i - 4);
        const slice = arr.slice(start, i + 1);
        return { t: p.t, v: slice.reduce((s, x) => s + x.v, 0) / slice.length };
      });
      // keep gauge responsive while avoiding extreme jitter
      const nextCap = Math.max(
        1,
        Number(this.stats.p95) * 1.15,
        Number(this.stats.max) * 1.05,
        this.currentRate * 1.05
      );
      this.gaugeCap = Math.max(nextCap, this.gaugeCap * 0.9);
      this.updateRecentSamples(this.points);
      this.renderLine(this.points, ma);
      this.renderHistogram(this.points.map((p) => p.v));
      this.renderGauge(this.currentRate, this.gaugeCap);
    } catch {
      // ignore
    }
  }

  // Use a typed d3.line generator instead of constructing path strings manually.
  // This relies on d3's TypeScript types being available in the project.

  private handleRangeResponse(res: PrometheusRangeResponse) {
    try {
      const vals = res?.data?.result?.[0]?.values || [];
      this.points = (vals as PrometheusRangeValue[]).map((v) => ({
        t: v[0] * 1000,
        v: Number(v[1]),
      }));
      this.currentValue = this.points.length
        ? this.points[this.points.length - 1].v
        : 0;
      this.lastUpdated = Date.now();
      this.computeStats(this.points.map((p) => p.v));
      // compute simple moving average (window=5)
      const ma = this.points.map((p, i, arr) => {
        const start = Math.max(0, i - 4);
        const slice = arr.slice(start, i + 1);
        return { t: p.t, v: slice.reduce((s, x) => s + x.v, 0) / slice.length };
      });
      this.updateRecentSamples(this.points);
      this.renderLine(this.points, ma);
      this.renderHistogram(this.points.map((p) => p.v));
      if (this.getSelectedMetric().kind === "gauge") {
        this.currentRate = this.currentValue;
        this.currentRateHuman = this.humanRate(this.currentRate);
        const nextCap = Math.max(
          1,
          Number(this.stats.p95) * 1.15,
          Number(this.stats.max) * 1.05,
          this.currentRate * 1.05
        );
        this.gaugeCap = Math.max(nextCap, this.gaugeCap * 0.9);
        this.renderGauge(this.currentRate, this.gaugeCap);
      } else {
        this.computeRate(this.points);
      }
    } catch {
      // ignore parse errors
    }
  }

  // initialize main line chart
  private initChart(): void {
    const d3 = this.d3 as D3Module;
    const el = this.chartEl?.nativeElement;
    if (!el) return;
    const w = el.clientWidth || 600;
    const h = 160;
    this.svg = d3.select(el).append("svg").attr("width", w).attr("height", h);
    this.svg
      .append("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", this.cssVar("--color-accent-2", "#7b61ff"))
      .attr("stroke-width", 2);
    this.svg
      .append("path")
      .attr("class", "ma")
      .attr("fill", "none")
      .attr("stroke", this.cssVar("--color-accent-1", "#ff6b6b"))
      .attr("stroke-width", 1.5)
      .style("stroke-dasharray", "4 2");
    // tooltip/focus group
    this.svg.append("g").attr("class", "focus").style("display", "none");
    this.svg
      .select("g.focus")
      .append("circle")
      .attr("r", 3)
      .attr("fill", this.cssVar("--color-accent-3", "#00e5ff"));
    this.svg
      .select("g.focus")
      .append("text")
      .attr("class", "focus-text")
      .attr("x", 8)
      .attr("y", -8)
      .attr("font-size", 11);
    // overlay for mouse events
    this.svg
      .append("rect")
      .attr("class", "overlay")
      .attr("fill", "none")
      .attr("pointer-events", "all");
  }

  private renderLine(
    points: Array<{ t: number; v: number }>,
    ma: Array<{ t: number; v: number }>
  ) {
    if (!this.svg) return;
    const d3 = this.d3 as D3Module;
    const el = this.chartEl?.nativeElement;
    if (!el) return;
    const w = el.clientWidth || 600;
    const h = 160;
    const margin = { left: 88, right: 6, top: 6, bottom: 18 };
    const timeExtent = d3.extent(points, (d: Point) => new Date(d.t)) as
      | [Date, Date]
      | undefined;
    const x = d3
      .scaleTime()
      .range([margin.left, w - margin.right])
      .domain(timeExtent ?? [new Date(0), new Date()]);
    // Use actual values instead of percent-normalizing to avoid flat-top rendering.
    const minV = Number(d3.min(points, (d: Point) => d.v) ?? 0);
    const maxV = Math.max(1, Number(d3.max(points, (d: Point) => d.v) ?? 1));
    const span = Math.max(1e-9, maxV - minV);
    const pad = span * 0.12;
    const yMin = Math.max(0, minV - pad);
    const yMax = maxV + pad;
    const y = d3
      .scaleLinear()
      .range([h - margin.bottom, margin.top])
      .domain([yMin, yMax]);
    const lineGen = d3
      .line()
      .x((d: unknown) => x(new Date((d as Point).t)))
      .y((d: unknown) => y((d as Point).v))
      .defined((d: unknown) => isFinite((d as Point).v)) as (
      data?: Point[] | null
    ) => string | null;

    const maLineGen = d3
      .line()
      .x((d: unknown) => x(new Date((d as Point).t)))
      .y((d: unknown) => y((d as Point).v))
      .defined((d: unknown) => isFinite((d as Point).v)) as (
      data?: Point[] | null
    ) => string | null;

    this.svg.attr("width", w).attr("height", h);
    this.svg
      .select("path.line")
      .datum(points)
      .attr("d", lineGen(points) ?? "");
    this.svg
      .select("path.ma")
      .datum(ma)
      .attr("d", maLineGen(ma) ?? "");
    this.renderGauge(this.currentRate, this.gaugeCap);

    // Axes: remove previous axes and draw new ones
    this.svg.selectAll("g.x-axis").remove();
    this.svg.selectAll("g.y-axis").remove();
    const xAxis = d3
      .axisBottom(x)
      .ticks(6)
      .tickFormat(d3.timeFormat("%H:%M") as (d: Date) => string);
    const yAxis = d3
      .axisLeft(y)
      .ticks(5)
      .tickFormat((d: number) => this.humanRate(Number(d)));
    this.svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${h - margin.bottom})`)
      .call(xAxis);
    this.svg
      .append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(yAxis);

    // update overlay size and mouse handlers
    const svgRef = this.svg as D3SVG;
    const overlay = svgRef
      .select("rect.overlay")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", w)
      .attr("height", h);
    const bisect = d3.bisector((d: Point) => d.t).left;
    overlay.on("mousemove", (event: PointerEvent) => {
      const [mx] = d3.pointer(event as PointerEvent);
      const x0 = x.invert(mx) as Date;
      const t = x0.getTime();
      const i = Math.max(0, Math.min(points.length - 1, bisect(points, t) - 1));
      const p = points[i] ?? points[points.length - 1];
      if (!p) return;
      const fx = x(new Date(p.t));
      const fy = y(p.v);
      const focus = svgRef.select("g.focus");
      focus.style("display", null as unknown as string);
      focus.select("circle").attr("cx", fx).attr("cy", fy);
      const labelX = Math.max(margin.left + 4, Math.min(fx + 8, w - 180));
      const labelY = Math.max(
        margin.top + 12,
        Math.min(fy - 8, h - margin.bottom - 4)
      );
      focus
        .select("text.focus-text")
        .attr("x", labelX)
        .attr("y", labelY)
        .text(`${new Date(p.t).toLocaleTimeString()} ${this.humanRate(p.v)}`);
    });
    overlay.on("mouseleave", () =>
      svgRef.select("g.focus").style("display", "none")
    );
  }

  exportCsv() {
    if (!this.points || this.points.length === 0) return;
    const rows = ["timestamp,value"];
    for (const p of this.points)
      rows.push([new Date(p.t).toISOString(), String(p.v)].join(","));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "telemetry.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  private initGauge() {
    const el = this.gaugeEl?.nativeElement;
    if (!el) return;
    const w = (el.clientWidth as number) || 220;
    const h = (el.clientHeight as number) || 110;
    const d3 = this.d3 as D3Module;
    this.gaugeSvg = d3
      .select(el)
      .append("svg")
      .attr("width", w)
      .attr("height", h);
    const gx = w / 2;
    const gy = h / 1.35; // move the half-donut up to sit tighter under the Throughput label
    this.gaugeGroup = this.gaugeSvg
      .append("g")
      .attr("class", "gauge")
      .attr("transform", `translate(${gx},${gy})`);
    // background arc
    this.gaugeGroup
      .append("path")
      .attr("class", "gauge-bg")
      .attr("fill", this.cssVar("--color-muted", "#e0e0e0"));
    // foreground arc
    this.gaugeGroup
      .append("path")
      .attr("class", "gauge-arc")
      .attr("fill", this.cssVar("--color-accent-1", "#ff6b6b"));
    // label
    this.gaugeGroup
      .append("text")
      .attr("class", "gauge-text")
      .attr("y", -6)
      .attr("text-anchor", "middle")
      .attr("font-size", 12);
  }

  private renderGauge(value: number, cap: number) {
    if (!this.gaugeGroup) return;
    const d3 = this.d3 as D3Module;
    const capNorm = Math.max(1, cap);
    const start = -Math.PI / 2;
    const end = start + Math.min(1, Math.max(0, value) / capNorm) * Math.PI;
    const inner = 30;
    const outer = 50;
    const arc = d3
      .arc()
      .innerRadius(inner)
      .outerRadius(outer)
      .startAngle(start)
      .endAngle(end as number);
    const full = d3
      .arc()
      .innerRadius(inner)
      .outerRadius(outer)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);
    this.gaugeGroup
      .select("path.gauge-bg")
      .attr("d", full as unknown as string);
    this.gaugeGroup
      .select("path.gauge-arc")
      .attr("d", arc as unknown as string);
    const pct = Math.min(
      100,
      Math.max(0, (Math.max(0, value) / capNorm) * 100)
    );
    this.gaugeGroup
      .select("text.gauge-text")
      .attr("font-size", 14)
      .attr("y", -12)
      .text(`${this.humanRate(value)} (${pct.toFixed(0)}%)`);
  }

  private initHist(): void {
    const el = this.histEl?.nativeElement;
    if (!el) return;
    const w = el.clientWidth || 300;
    const h = 140;
    const d3 = this.d3 as D3Module;
    this.histSvg = d3
      .select(el)
      .append("svg")
      .attr("width", w)
      .attr("height", h);
  }

  private renderHistogram(values: number[]) {
    if (!this.histSvg) return;
    const d3 = this.d3 as D3Module;
    const el = this.histEl?.nativeElement;
    if (!el) return;
    const w = el.clientWidth || 300;
    const h = 140;
    const margin = { left: 32, right: 8, top: 6, bottom: 22 };
    this.histSvg.attr("width", w).attr("height", h);

    const data = (values || []).filter((v) => isFinite(v) && v >= 0);
    if (data.length === 0) {
      this.histSvg.selectAll("*").remove();
      return;
    }

    const x = d3
      .scaleLinear()
      .domain([0, (d3.max(data) ?? 1) * 1.05])
      .range([margin.left, w - margin.right]);
    // create typed bins from d3.bin output
    type RawBin = Array<number> & { x0?: number; x1?: number };
    const rawBins = d3.bin().thresholds(16)(data) as RawBin[];
    type Bin = { x0: number; x1: number; length: number; values: number[] };
    const bins: Bin[] = rawBins.map((b) => ({
      x0: Number(b.x0 ?? 0),
      x1: Number(b.x1 ?? 0),
      length: b.length,
      values: Array.from(b),
    }));

    const y = d3
      .scaleLinear()
      .domain([0, Math.max(1, Number(d3.max(bins, (b: Bin) => b.length) ?? 1))])
      .range([h - margin.bottom, margin.top]);

    const g = this.histSvg
      .selectAll("g.bin")
      .data(bins, (d: unknown) => `${(d as Bin).x0}-${(d as Bin).x1}`);
    const gEnter = g.enter().append("g").attr("class", "bin");
    gEnter.append("rect");
    const all = gEnter.merge(g);

    all
      .select("rect")
      .attr("x", (d: Bin) => x(d.x0))
      .attr("y", (d: Bin) => y(d.length))
      .attr("width", (d: Bin) => Math.max(1, x(d.x1) - x(d.x0) - 1))
      .attr("height", (d: Bin) => h - margin.bottom - y(d.length))
      .attr("fill", this.cssVar("--color-accent-3", "#00e5ff"));
    g.exit().remove();

    this.histSvg.selectAll("g.hist-x-axis").remove();
    this.histSvg
      .append("g")
      .attr("class", "hist-x-axis")
      .attr("transform", `translate(0,${h - margin.bottom})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((d: number) => this.humanRate(Number(d)))
      );
  }

  private loadD3() {
    if (this.d3) return of(this.d3);
    if (_d3) {
      this.d3 = _d3;
      return of(this.d3);
    }
    return from(import("d3")).pipe(
      map((mod: D3Module) => {
        _d3 = mod;
        this.d3 = mod;
        return this.d3;
      }),
      catchError(() => {
        this.d3 = null;
        return of(null);
      })
    );
  }

  private computeRate(points: Array<{ t: number; v: number }>) {
    if (!points || points.length < 2) {
      this.currentRate = 0;
      this.currentRateHuman = this.humanRate(0);
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
    this.currentRateHuman = this.humanRate(this.currentRate);
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
    }, 0);
  }

  private ensureVizInitialized() {
    if (this.selectedVizTab === 0 && !this.svg) this.initChart();
    if (this.selectedVizTab === 1 && !this.histSvg) this.initHist();
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
        this.pulsarStatus = {
          brokers: status.brokers || 0,
          topics: status.topics || 0,
          partitions: status.partitions || 0,
        };
      },
      () => {
        // Keep previous status or set to 0 on error
        this.pulsarStatus = { brokers: 0, topics: 0, partitions: 0 };
      }
    );
  }

  private fetchRabbitMQStatus(): void {
    this.http.get<RabbitMQStatus>("/api/v1/rabbitmq/status").subscribe(
      (status: RabbitMQStatus) => {
        this.rabbitMQStatus = {
          status: status.status || "unknown",
          connection: status.connection || "unknown",
          queues: status.queues || {},
          exchanges: status.exchanges || {},
          error: status.error,
        };
      },
      () => {
        // Set to disconnected on error
        this.rabbitMQStatus = {
          status: "error",
          connection: "error",
          queues: {},
          exchanges: {},
          error: "Connection failed",
        };
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
          this.infrastructureTelemetry = this.normalizeInfraSnapshot(snapshot);
          const pulsar = snapshot.services.pulsar;
          if (pulsar && pulsar.source !== "unavailable") {
            this.pulsarStatus = {
              brokers: Math.round(Number(pulsar.brokers ?? 0)),
              topics: Math.round(Number(pulsar.topics ?? 0)),
              partitions: Math.round(Number(pulsar.partitions ?? 0)),
            };
          }
        },
        () => {
          this.infrastructureTelemetry = null;
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
    this.alertSloLoading = true;
    this.alertSloError = null;
    this.http.get<AlertSloMetrics>("/api/v1/alerts/slo").subscribe(
      (slo) => {
        this.alertSlo = slo;
        this.alertSloLoading = false;
      },
      () => {
        this.alertSloError = "Alert SLO endpoint unavailable";
        this.alertSloLoading = false;
      }
    );
    this.http.get<TransientAlert[]>("/api/v1/alerts/dlq").subscribe(
      (dlq) => {
        this.alertDlq = dlq;
      },
      () => {
        this.alertDlq = [];
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
          this.alertSloError = `Replay failed for alert ${alertId}`;
        }
      );
  }

  replayAllFromDlq(): void {
    this.http.post<number>("/api/v1/alerts/dlq/replay-all", {}).subscribe(
      () => {
        this.fetchAlertSlo();
      },
      () => {
        this.alertSloError = "Replay-all failed";
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

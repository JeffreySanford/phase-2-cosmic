import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BrowserPlatformService } from "../../services/browser-platform.service";
import { DataSourceService } from "../../services/data-source.service";
import { MockDataService } from "../../services/mock-data.service";
import { BehaviorSubject } from "rxjs";

interface TimePoint {
  t: number;
  v: number;
}

@Component({
  selector: "app-visualization",
  templateUrl: "./visualization.component.html",
  styleUrls: ["./visualization.component.scss"],
  standalone: false,
})
export class VisualizationComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private browser = inject(BrowserPlatformService);
  private dataSource = inject(DataSourceService);
  private mock = inject(MockDataService);

  readonly throughput$ = new BehaviorSubject<number>(0);
  get throughput(): number {
    return this.throughput$.value;
  }
  readonly errorRate$ = new BehaviorSubject<number>(0);
  get errorRate(): number {
    return this.errorRate$.value;
  }
  readonly queueDepth$ = new BehaviorSubject<number>(0);
  get queueDepth(): number {
    return this.queueDepth$.value;
  }

  sparklineData: TimePoint[] = [];
  queueSeriesData: TimePoint[] = [];
  histogramData: number[] = [];
  scatterData: Array<{ x: number; y: number }> = [];

  private liveTimer?: number;

  private deferUiUpdate(task: () => void): void {
    setTimeout(task, 0);
  }

  // need BehaviorSubject import
  readonly Math = Math;

  // Hover state for small and big sparklines
  hoverLabelSmall?: string;
  hoverPosSmall?: { left: number; top: number } | null = null;

  hoverLabelBig?: string;
  hoverPosBig?: { left: number; top: number } | null = null;

  ngOnInit(): void {
    // fetch once and then poll — fall back to local synthetic data on error
    this.fetchMetrics();
    this.startLive();
  }

  ngOnDestroy(): void {
    this.stopLive();
  }

  resetData() {
    const now = Date.now();
    this.sparklineData = Array.from({ length: 40 }).map((_, i) => ({
      t: now - (40 - i) * 1000,
      v: Math.random() * 60 + 20,
    }));
    this.queueSeriesData = Array.from({ length: 40 }).map((_, i) => ({
      t: now - (40 - i) * 1000,
      v: Math.round(Math.random() * 50),
    }));
    this.histogramData = Array.from({ length: 10 }).map(() =>
      Math.floor(Math.random() * 20)
    );
    this.scatterData = Array.from({ length: 60 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
    }));
    this.recomputeAggregates();
  }

  recomputeAggregates() {
    const last = this.sparklineData[this.sparklineData.length - 1];
    const lastQueue = this.queueSeriesData[this.queueSeriesData.length - 1];
    this.deferUiUpdate(() => {
      this.throughput$.next(last ? Math.round(last.v * 10) / 10 : 0);
      this.queueDepth$.next(
        lastQueue ? Math.max(0, Math.round(lastQueue.v)) : 0
      );
    });
  }

  get sparklinePointsSmall(): string {
    const d = this.sparklineData;
    if (!d || d.length < 2) return "";
    const len = d.length - 1;
    return d
      .map((p, i) => `${(i / len) * 100},${20 - (p.v / 100) * 18}`)
      .join(" ");
  }

  get sparklinePointsBig(): string {
    const d = this.sparklineData;
    if (!d || d.length < 2) return "";
    const len = d.length - 1;
    return d
      .map((p, i) => `${(i / len) * 600},${160 - (p.v / 100) * 140}`)
      .join(" ");
  }

  get throughputComparePoints(): string {
    const series = this.sparklineData;
    if (!series.length) return "";
    const max = Math.max(...series.map((point) => point.v), 1);
    const len = Math.max(series.length - 1, 1);
    return series
      .map((point, index) => {
        const x = (index / len) * 280;
        const y = 108 - (point.v / max) * 92;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  get queueAreaPoints(): string {
    const queueSeries = this.queueSeriesData.map((point) => point.v);
    if (!queueSeries.length) return "0,108 280,108 280,108 0,108";
    const max = Math.max(...queueSeries, 1);
    const len = Math.max(queueSeries.length - 1, 1);
    const topEdge = queueSeries
      .map((value, index) => {
        const x = (index / len) * 280;
        const y = 108 - (value / max) * 68;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    return `0,108 ${topEdge} 280,108`;
  }

  startLive() {
    this.stopLive();
    this.liveTimer = this.browser.window?.setInterval(() => {
      this.fetchMetrics();
    }, 1000);
  }

  stopLive() {
    if (this.liveTimer) {
      this.browser.window?.clearInterval(this.liveTimer);
      this.liveTimer = undefined;
    }
  }

  fetchMetrics() {
    if (this.dataSource.mode === "mock") {
      this.mock.visualizationMetrics().subscribe((resp) => {
        const body = resp.data;
        if (!body) {
          if (!this.sparklineData.length) this.resetData();
          return;
        }
        this.deferUiUpdate(() => {
          this.throughput$.next(+body.throughput);
          this.errorRate$.next(+body.errorRate);
          this.queueDepth$.next(+body.queueDepth);
        });
        this.sparklineData = body.sparkline.map((p) => ({ t: +p.t, v: +p.v }));
        this.queueSeriesData = (body.queueSeries || []).map((p) => ({
          t: +p.t,
          v: +p.v,
        }));
        this.histogramData = body.histogram.map((n) => +n);
        this.scatterData = body.scatter.map((p) => ({ x: +p.x, y: +p.y }));
        this.recomputeAggregates();
      });
      return;
    }

    interface VisualizationResponse {
      source?: string;
      data?: {
        throughput?: number;
        errorRate?: number;
        queueDepth?: number;
        sparkline?: Array<{ t: number; v: number }>;
        queueSeries?: Array<{ t: number; v: number }>;
        histogram?: number[];
        scatter?: Array<{ x: number; y: number }>;
      };
      payload?: {
        throughput?: number;
        errorRate?: number;
        queueDepth?: number;
        sparkline?: Array<{ t: number; v: number }>;
        queueSeries?: Array<{ t: number; v: number }>;
        histogram?: number[];
        scatter?: Array<{ x: number; y: number }>;
      };
    }

    this.http
      .get<VisualizationResponse>("/api/v1/visualization/metrics")
      .subscribe({
        next: (resp) => {
          // service returns { source: 'prometheus'|'fallback', data: { ... } }
          const body = resp?.data || resp?.payload;
          if (!body) {
            if (!this.sparklineData.length) this.resetData();
            return;
          }

          // map expected fields
          if (body.throughput !== undefined)
            this.throughput$.next(+body.throughput);
          if (body.errorRate !== undefined)
            this.errorRate$.next(+body.errorRate);
          if (body.queueDepth !== undefined)
            this.queueDepth$.next(+body.queueDepth);

          if (Array.isArray(body.sparkline)) {
            this.sparklineData = body.sparkline.map((p) => ({
              t: +p.t,
              v: +p.v,
            }));
          }

          if (Array.isArray(body.queueSeries)) {
            this.queueSeriesData = body.queueSeries.map((p) => ({
              t: +p.t,
              v: +p.v,
            }));
          }

          if (Array.isArray(body.histogram)) {
            this.histogramData = body.histogram.map((n) => +n);
          }

          if (Array.isArray(body.scatter)) {
            this.scatterData = body.scatter.map((p) => ({ x: +p.x, y: +p.y }));
          }

          // recompute aggregates if needed
          this.recomputeAggregates();
        },
        error: () => {
          // On error use local synthetic generator
          if (!this.sparklineData.length) this.resetData();
        },
      });
  }

  // Interaction helpers for showing X/Y coordinates on hover
  onSparklineHover(evt: MouseEvent, which: "small" | "big") {
    const wrapper = evt.currentTarget as HTMLElement;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const w = rect.width || 1;
    const ratio = Math.max(0, Math.min(1, x / w));
    const n = this.sparklineData.length;
    if (n === 0) return;
    const idx = Math.round(ratio * (n - 1));
    const pt = this.sparklineData[Math.max(0, Math.min(n - 1, idx))];
    if (!pt) return;
    const ts = new Date(pt.t);
    const timeStr = ts.toLocaleTimeString();
    const label = `${timeStr} • ${pt.v.toFixed(1)}`;

    if (which === "small") {
      this.hoverLabelSmall = label;
      this.hoverPosSmall = { left: x, top: y - 28 };
    } else {
      this.hoverLabelBig = label;
      this.hoverPosBig = { left: x, top: y - 28 };
    }
  }

  clearHover(which?: "small" | "big") {
    if (!which || which === "small") {
      this.hoverLabelSmall = undefined;
      this.hoverPosSmall = null;
    }
    if (!which || which === "big") {
      this.hoverLabelBig = undefined;
      this.hoverPosBig = null;
    }
  }

  exportSnapshot() {
    alert("Export snapshot: not implemented in this build");
  }
}

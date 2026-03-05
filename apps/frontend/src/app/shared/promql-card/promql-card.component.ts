import { Component, Input, OnDestroy, OnInit } from "@angular/core";
import { TelemetryService } from "../../services/telemetry.service";
import {
  LoadProfileService,
  LoadProfilePct,
} from "../../services/load-profile.service";
import { Subscription, timer } from "rxjs";
import { switchMap } from "rxjs/operators";

type PrometheusRangeResponseLocal = {
  data?: { result?: { values?: Array<[number | string, string]> }[] };
};
type MetricFormat = "percent" | "binary" | "number";

@Component({
  selector: "app-promql-card",
  templateUrl: "./promql-card.component.html",
  styleUrls: ["./promql-card.component.scss"],
})
export class PromqlCardComponent implements OnInit, OnDestroy {
  @Input() query = "";
  @Input() title = "";
  @Input() tone: "cyan" | "violet" | "amber" | "mint" | "rose" | "blue" =
    "cyan";

  currentValue = 0;
  points: number[] = [];
  path = "";
  loading = false;
  profilePct: LoadProfilePct = 50;
  lastUpdated: Date | null = null;
  private refreshSub?: Subscription;
  private profileSub?: Subscription;

  constructor(
    private telemetry: TelemetryService,
    private loadProfile: LoadProfileService
  ) {}

  ngOnInit(): void {
    if (!this.query) return;
    this.refreshSub = this.loadProfile.pollingMs$
      .pipe(switchMap((ms) => timer(0, ms)))
      .subscribe(() => this.refresh());
    this.profileSub = this.loadProfile.profile$.subscribe(
      (pct) => (this.profilePct = pct)
    );
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.profileSub?.unsubscribe();
  }

  refresh() {
    this.loading = true;
    const end = Math.floor(Date.now() / 1000);
    const start = end - 300;
    const step = 15;
    this.telemetry.queryRange(this.query, start, end, step).subscribe(
      (res: unknown) => {
        try {
          const r = res as PrometheusRangeResponseLocal;
          const vals = r?.data?.result?.[0]?.values ?? [];
          this.points = vals.map((p) => Number(p[1]) || 0);
          this.currentValue = this.points.length
            ? this.points[this.points.length - 1]
            : 0;
          this.path = this.sparkPath(
            this.smoothedPoints(this.points),
            120,
            30,
            this.metricFormat()
          );
          this.lastUpdated = new Date();
        } catch {
          this.points = [];
          this.path = "";
          this.currentValue = 0;
        }
        this.loading = false;
      },
      () => (this.loading = false)
    );
  }

  displayValue(): string {
    const format = this.metricFormat();
    if (format === "percent") return `${this.currentValue.toFixed(1)}%`;
    if (format === "binary") return this.currentValue >= 1 ? "Up" : "Down";
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(this.currentValue);
  }

  private metricFormat(): MetricFormat {
    const q = this.query.toLowerCase();
    if (q.includes("cpu") || q.includes("percent") || q.includes("%"))
      return "percent";
    if (q.includes("sum(up)") || q.includes("up{job=") || q === "up")
      return "binary";
    return "number";
  }

  private smoothedPoints(points: number[]): number[] {
    if (points.length < 3) return points;
    return points.map((_, index) => {
      const start = Math.max(0, index - 2);
      const end = Math.min(points.length, index + 1);
      const window = points.slice(start, end);
      return window.reduce((sum, value) => sum + value, 0) / window.length;
    });
  }

  private sparkPath(
    points: number[],
    w: number,
    h: number,
    format: MetricFormat
  ) {
    if (!points?.length) return "";
    let min = Math.min(...points);
    let max = Math.max(...points);
    if (format === "percent") {
      min = 0;
      max = 100;
    } else if (format === "binary") {
      min = 0;
      max = Math.max(1, max);
    }
    const range = max - min || 1;
    const step = w / Math.max(points.length - 1, 1);
    return points
      .map((v, i) => {
        const x = i * step;
        const bounded = Math.max(min, Math.min(max, v));
        const y = h - ((bounded - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }
}

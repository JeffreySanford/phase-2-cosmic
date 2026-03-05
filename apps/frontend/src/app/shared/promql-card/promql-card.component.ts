import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { TelemetryService } from '../../services/telemetry.service';
import { LoadProfileService, LoadProfilePct } from '../../services/load-profile.service';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

type PrometheusRangeResponseLocal = { data?: { result?: { values?: Array<[number | string, string]> }[] } };

@Component({
  selector: 'app-promql-card',
  templateUrl: './promql-card.component.html',
  styleUrls: ['./promql-card.component.scss'],
})
export class PromqlCardComponent implements OnInit, OnDestroy {
  @Input() query = '';
  @Input() title = '';
  @Input() tone: 'cyan' | 'violet' | 'amber' | 'mint' | 'rose' | 'blue' = 'cyan';

  currentValue = 0;
  points: number[] = [];
  path = '';
  loading = false;
  profilePct: LoadProfilePct = 50;
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
    this.profileSub = this.loadProfile.profile$.subscribe((pct) => (this.profilePct = pct));
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.profileSub?.unsubscribe();
  }

  refresh() {
    this.loading = true;
    // instant
    this.telemetry.queryInstant(this.query).subscribe((v) => (this.currentValue = v));

    // range for sparkline (last 5 minutes, 15s step)
    const end = Math.floor(Date.now() / 1000);
    const start = end - 300;
    const step = 15;
    this.telemetry.queryRange(this.query, start, end, step).subscribe(
      (res: unknown) => {
        try {
          const r = res as PrometheusRangeResponseLocal;
          const vals = r?.data?.result?.[0]?.values ?? [];
          this.points = vals.map((p) => Number(p[1]) || 0);
          this.path = this.sparkPath(this.points, 120, 30);
        } catch {
          this.points = [];
          this.path = '';
        }
        this.loading = false;
      },
      () => (this.loading = false),
    );
  }

  private sparkPath(points: number[], w: number, h: number) {
    if (!points?.length) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const step = w / Math.max(points.length - 1, 1);
    return points
      .map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }
}

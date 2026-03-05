import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DataSourceService } from '../../services/data-source.service';
import { MockDataService } from '../../services/mock-data.service';

interface TimePoint { t: number; v: number }

@Component({
  selector: 'app-visualization',
  templateUrl: './visualization.component.html',
  styleUrls: ['./visualization.component.scss'],
  standalone: false
})
export class VisualizationComponent implements OnInit, OnDestroy {
  throughput = 0;
  errorRate = 0;
  queueDepth = 0;

  sparklineData: TimePoint[] = [];
  histogramData: number[] = [];
  scatterData: Array<{x:number,y:number}> = [];

  private liveTimer?: number;
  readonly Math = Math;

  // Hover state for small and big sparklines
  hoverLabelSmall?: string;
  hoverPosSmall?: { left: number; top: number } | null = null;

  hoverLabelBig?: string;
  hoverPosBig?: { left: number; top: number } | null = null;

  constructor(private http: HttpClient, private dataSource: DataSourceService, private mock: MockDataService) {}

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
    this.sparklineData = Array.from({length:40}).map((_,i)=>({t: now - (40-i)*1000, v: Math.random()*60+20}));
    this.histogramData = Array.from({length:10}).map(()=>Math.floor(Math.random()*20));
    this.scatterData = Array.from({length:60}).map(()=>({x: Math.random()*100, y: Math.random()*100}));
    this.recomputeAggregates();
  }

  recomputeAggregates(){
    const last = this.sparklineData[this.sparklineData.length-1];
    this.throughput = last ? Math.round(last.v*10)/10 : 0;
    this.errorRate = +(Math.random()*2).toFixed(2);
    this.queueDepth = Math.max(0, Math.round((Math.random()*50)));
  }

  get sparklinePointsSmall(): string {
    const d = this.sparklineData;
    if (!d || d.length < 2) return '';
    const len = d.length - 1;
    return d.map((p, i) => `${(i / len) * 100},${(20 - (p.v / 100) * 18)}`).join(' ');
  }

  get sparklinePointsBig(): string {
    const d = this.sparklineData;
    if (!d || d.length < 2) return '';
    const len = d.length - 1;
    return d.map((p, i) => `${(i / len) * 600},${(160 - (p.v / 100) * 140)}`).join(' ');
  }

  startLive(){
    this.stopLive();
    this.liveTimer = window.setInterval(()=>{
      this.fetchMetrics();
    }, 1000);
  }

  stopLive(){
    if(this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = undefined }
  }

  fetchMetrics(){
    if (this.dataSource.mode === 'mock') {
      this.mock.visualizationMetrics().subscribe((resp) => {
        const body = resp?.data || resp?.payload || resp;
        if (!body) { if(!this.sparklineData.length) this.resetData(); return; }
        if (body.throughput !== undefined) this.throughput = +body.throughput;
        if (body.errorRate !== undefined) this.errorRate = +body.errorRate;
        if (body.queueDepth !== undefined) this.queueDepth = +body.queueDepth;
        if (Array.isArray(body.sparkline)) this.sparklineData = body.sparkline.map((p: any) => ({ t: +p.t, v: +p.v }));
        if (Array.isArray(body.histogram)) this.histogramData = body.histogram.map((n: any) => +n);
        if (Array.isArray(body.scatter)) this.scatterData = body.scatter.map((p: any) => ({ x: +p.x, y: +p.y }));
        this.recomputeAggregates();
      });
      return;
    }

    this.http.get<any>('/api/v1/visualization/metrics').subscribe({
      next: (resp) => {
        // service returns { source: 'prometheus'|'fallback', data: { ... } }
        const body = resp?.data || resp?.payload || resp;
        if (!body) { if(!this.sparklineData.length) this.resetData(); return; }

        // map expected fields
        if (body.throughput !== undefined) this.throughput = +body.throughput;
        if (body.errorRate !== undefined) this.errorRate = +body.errorRate;
        if (body.queueDepth !== undefined) this.queueDepth = +body.queueDepth;

        if (Array.isArray(body.sparkline)) {
          this.sparklineData = body.sparkline.map((p: any) => ({ t: +p.t, v: +p.v }));
        }

        if (Array.isArray(body.histogram)) {
          this.histogramData = body.histogram.map((n: any) => +n);
        }

        if (Array.isArray(body.scatter)) {
          this.scatterData = body.scatter.map((p: any) => ({ x: +p.x, y: +p.y }));
        }

        // recompute aggregates if needed
        this.recomputeAggregates();
      },
      error: () => {
        // On error use local synthetic generator
        if(!this.sparklineData.length) this.resetData();
      }
    });
  }

  // Interaction helpers for showing X/Y coordinates on hover
  onSparklineHover(evt: MouseEvent, which: 'small' | 'big') {
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

    if (which === 'small') {
      this.hoverLabelSmall = label;
      this.hoverPosSmall = { left: x, top: y - 28 };
    } else {
      this.hoverLabelBig = label;
      this.hoverPosBig = { left: x, top: y - 28 };
    }
  }

  clearHover(which?: 'small' | 'big') {
    if (!which || which === 'small') { this.hoverLabelSmall = undefined; this.hoverPosSmall = null; }
    if (!which || which === 'big') { this.hoverLabelBig = undefined; this.hoverPosBig = null; }
  }

  exportSnapshot(){
    alert('Export snapshot: not implemented in this build');
  }
}

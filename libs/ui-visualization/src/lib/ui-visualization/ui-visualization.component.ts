import { Component, OnDestroy, OnInit } from '@angular/core';

interface TimePoint { t: number; v: number }

@Component({
  selector: 'lib-ui-visualization',
  templateUrl: './ui-visualization.component.html',
  styleUrls: ['./ui-visualization.component.scss']
})
export class UiVisualizationComponent implements OnInit, OnDestroy {
  throughput = 0;
  errorRate = 0;
  queueDepth = 0;

  sparklineData: TimePoint[] = [];
  histogramData: number[] = [];
  scatterData: Array<{x:number,y:number}> = [];

  private liveTimer?: number;
  // expose global Math for template expressions
  readonly Math = Math;

  ngOnInit(): void {
    this.resetData();
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
    this.throughput = Math.round(last.v*10)/10;
    this.errorRate = +(Math.random()*2).toFixed(2);
    this.queueDepth = Math.max(0, Math.round((Math.random()*50)));
  }

  // Pre-computed point strings for svg polylines — computed as getters so templates stay simple
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
      this.advance();
    }, 1000);
  }

  stopLive(){
    if(this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = undefined }
  }

  advance(){
    const now = Date.now();
    const nextVal = Math.max(5, (this.sparklineData[this.sparklineData.length-1]?.v || 40) + (Math.random()-0.5)*10);
    this.sparklineData.push({t: now, v: nextVal});
    if(this.sparklineData.length>60) this.sparklineData.shift();
    // mutate histogram and scatter slightly
    this.histogramData = this.histogramData.map(v=>Math.max(0, v + Math.floor((Math.random()-0.45)*3)));
    this.scatterData = this.scatterData.map(p=>({x: Math.min(100, Math.max(0, p.x + (Math.random()-0.5)*6)), y: Math.min(100, Math.max(0, p.y + (Math.random()-0.5)*6))}));
    this.recomputeAggregates();
  }

  exportSnapshot(){
    // Placeholder hook for snapshot/export functionality
    alert('Export snapshot: not implemented in this build');
  }
}

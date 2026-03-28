import { Injectable, inject } from "@angular/core";
import { BrowserPlatformService } from "./browser-platform.service";

export type TelemetryPoint = { t: number; v: number };

export interface TelemetryChartConfig {
  lineColor: string;
  maColor: string;
  focusColor: string;
  histogramColor: string;
  gaugeColor: string;
}

type D3Module = typeof import("d3");

type D3Selection = {
  append: (tag: string) => D3Selection;
  attr: (name: string, value?: unknown) => D3Selection;
  select: (sel: string) => D3Selection;
  selectAll: (sel: string) => D3Selection;
  datum: (data: unknown) => D3Selection;
  data: (
    data: unknown[],
    key?: (d: unknown, i: number) => unknown
  ) => D3Selection;
  enter: () => D3Selection;
  merge: (other: D3Selection) => D3Selection;
  call: (fn: (sel: D3Selection) => void) => D3Selection;
  text: (t?: unknown) => D3Selection;
  remove: () => void;
  node: () => Element;
  on: (
    event: string,
    handler: (event: unknown, ...args: unknown[]) => void
  ) => D3Selection;
  style: (name: string, value?: unknown) => D3Selection;
  exit: () => D3Selection;
};

type D3ScaleTime = {
  (value: number | Date): number;
  range: (range: [number, number]) => D3ScaleTime;
  domain: (domain: [Date, Date]) => D3ScaleTime;
  invert: (value: number) => Date;
};

type D3ScaleLinear = {
  (value: number): number;
  range: (range: [number, number]) => D3ScaleLinear;
  domain: (domain: [number, number]) => D3ScaleLinear;
  invert: (value: number) => number;
};

type GaugeArcDatum = {
  innerRadius: number;
  outerRadius: number;
  endAngle: number;
};

type GaugeArcBuilder = {
  (datum: GaugeArcDatum): string | null;
  innerRadius: (
    radius: number | ((datum: GaugeArcDatum) => number)
  ) => GaugeArcBuilder;
  outerRadius: (
    radius: number | ((datum: GaugeArcDatum) => number)
  ) => GaugeArcBuilder;
  startAngle: (angle: number) => GaugeArcBuilder;
};

@Injectable({ providedIn: "root" })
export class TelemetryChartService {
  private readonly browser = inject(BrowserPlatformService);
  private d3: D3Module | null = null;
  private svg: D3Selection | null = null;
  private histSvg: D3Selection | null = null;
  private gaugeSvg: D3Selection | null = null;
  private gaugeGroup: D3Selection | null = null;

  async initLineChart(
    container: HTMLElement,
    config: TelemetryChartConfig
  ): Promise<void> {
    const d3 = await this.loadD3();
    if (!d3) return;

    const w = container.clientWidth || 600;
    const h = 160;
    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", w)
      .attr("height", h);

    this.svg = svg;

    svg
      .append("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", config.lineColor)
      .attr("stroke-width", 2);

    svg
      .append("path")
      .attr("class", "ma")
      .attr("fill", "none")
      .attr("stroke", config.maColor)
      .attr("stroke-width", 1.5)
      .style("stroke-dasharray", "4 2");

    // tooltip/focus group
    svg.append("g").attr("class", "focus").style("display", "none");
    svg
      .select("g.focus")
      .append("circle")
      .attr("r", 3)
      .attr("fill", config.focusColor);
    svg
      .select("g.focus")
      .append("text")
      .attr("class", "focus-text")
      .attr("x", 8)
      .attr("y", -8)
      .attr("font-size", 11);

    // overlay for mouse events
    svg
      .append("rect")
      .attr("class", "overlay")
      .attr("fill", "none")
      .attr("pointer-events", "all");
  }

  renderLine(
    points: TelemetryPoint[],
    ma: TelemetryPoint[],
    currentRate: number,
    gaugeCap: number,
    humanRate: (v: number) => string,
    config: TelemetryChartConfig
  ): void {
    if (!this.svg || !this.d3) return;

    const container = this.svg.node()?.parentElement as HTMLElement | null;
    if (!container) return;

    const w = container.clientWidth || 600;
    const h = container.clientHeight || 160;
    const margin = { left: 88, right: 6, top: 6, bottom: 18 };

    const d3 = this.d3;
    const timeExtent = d3.extent(
      points,
      (d: TelemetryPoint) => new Date(d.t)
    ) as [Date, Date] | undefined;
    const x = (d3.scaleTime() as unknown as D3ScaleTime)
      .range([margin.left, w - margin.right])
      .domain(timeExtent ?? [new Date(0), new Date()]);

    const minV = Number(d3.min(points, (d: TelemetryPoint) => d.v) ?? 0);
    const maxV = Math.max(
      1,
      Number(d3.max(points, (d: TelemetryPoint) => d.v) ?? 1)
    );
    const span = Math.max(1e-9, maxV - minV);
    const pad = span * 0.12;
    const yMin = Math.max(0, minV - pad);
    const yMax = maxV + pad;
    const y = (d3.scaleLinear() as unknown as D3ScaleLinear)
      .range([h - margin.bottom, margin.top])
      .domain([yMin, yMax]);

    const lineGen = d3
      .line()
      .x((d: unknown) => x(new Date((d as TelemetryPoint).t)))
      .y((d: unknown) => y((d as TelemetryPoint).v))
      .defined((d: unknown) => isFinite((d as TelemetryPoint).v)) as (
      data?: TelemetryPoint[] | null
    ) => string | null;

    const maLineGen = d3
      .line()
      .x((d: unknown) => x(new Date((d as TelemetryPoint).t)))
      .y((d: unknown) => y((d as TelemetryPoint).v))
      .defined((d: unknown) => isFinite((d as TelemetryPoint).v)) as (
      data?: TelemetryPoint[] | null
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

    // axes
    this.svg.selectAll("g.x-axis").remove();
    this.svg.selectAll("g.y-axis").remove();
    const xAxis = d3
      .axisBottom(x)
      .ticks(6)
      .tickFormat(d3.timeFormat("%H:%M") as (d: Date) => string);
    const yAxis = d3
      .axisLeft(y)
      .ticks(5)
      .tickFormat((d: number) => humanRate(Number(d)));

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

    this.updateOverlay(points, x, y, w, h, margin, humanRate);

    this.renderGauge(currentRate, gaugeCap, humanRate, config);
  }

  private updateOverlay(
    points: TelemetryPoint[],
    x: D3ScaleTime,
    y: D3ScaleLinear,
    w: number,
    h: number,
    margin: { left: number; right: number; top: number; bottom: number },
    humanRate: (v: number) => string
  ) {
    if (!this.svg || !this.d3) return;
    const d3 = this.d3;
    const svgRef = this.svg as D3Selection;
    const overlay = svgRef
      .select("rect.overlay")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", w)
      .attr("height", h);
    const bisect = (
      d3.bisector((d: TelemetryPoint) => d.t) as unknown as {
        left: (array: TelemetryPoint[], x: number) => number;
      }
    ).left;

    overlay.on("mousemove", (event: unknown) => {
      const pointer = (
        d3.pointer as unknown as (event: unknown) => [number, number]
      )(event);
      const [mx] = pointer;
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
        .text(humanRate(p.v));
    });
  }

  async initHistogram(container: HTMLElement): Promise<void> {
    const d3 = await this.loadD3();
    if (!d3) return;

    const w = container.clientWidth || 300;
    const h = container.clientHeight || 140;
    this.histSvg = d3
      .select(container)
      .append("svg")
      .attr("width", w)
      .attr("height", h);
  }

  renderHistogram(
    values: number[],
    humanRate: (v: number) => string,
    color: string
  ): void {
    if (!this.histSvg || !this.d3) return;
    const d3 = this.d3;
    const container = this.histSvg.node()?.parentElement as HTMLElement | null;
    if (!container) return;

    const w = container.clientWidth || 300;
    const h = container.clientHeight || 140;
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
      .attr("fill", color);
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
          .tickFormat((d: number) => humanRate(Number(d)))
      );
  }

  async initGauge(
    container: HTMLElement,
    config: TelemetryChartConfig
  ): Promise<void> {
    const d3 = await this.loadD3();
    if (!d3) return;

    const w = container.clientWidth || 300;
    const h = container.clientHeight || 120;
    const gaugeSvg = d3
      .select(container)
      .append("svg")
      .attr("width", w)
      .attr("height", h);
    this.gaugeSvg = gaugeSvg;

    const centerX = w / 2;
    const centerY = h / 1.2;
    const radius = Math.min(w, h) / 2.4;

    const gaugeGroup = gaugeSvg
      .append("g")
      .attr("transform", `translate(${centerX},${centerY})`);
    this.gaugeGroup = gaugeGroup;

    // full arc background
    const arc = d3
      .arc()
      .innerRadius(radius * 0.6)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2);
    gaugeGroup
      .append("path")
      .attr("class", "gauge-bg")
      .attr("d", arc({ endAngle: Math.PI / 2 }) as unknown as string)
      .attr("fill", "#eee");

    // filled arc
    gaugeGroup
      .append("path")
      .attr("class", "gauge-fill")
      .attr("fill", config.gaugeColor);

    // text
    gaugeGroup
      .append("text")
      .attr("class", "gauge-text")
      .attr("text-anchor", "middle")
      .attr("font-size", 14)
      .attr("y", -12);
  }

  renderGauge(
    value: number,
    cap: number,
    humanRate: (v: number) => string,
    config: TelemetryChartConfig
  ): void {
    const gaugeGroup = this.gaugeGroup;
    const d3 = this.d3;
    if (!gaugeGroup || !d3) return;

    const capNorm = Math.max(1, cap);
    const pct = Math.min(
      100,
      Math.max(0, (Math.max(0, value) / capNorm) * 100)
    );

    const arc = (d3.arc() as unknown as GaugeArcBuilder)
      .innerRadius((d) => d.innerRadius)
      .outerRadius((d) => d.outerRadius)
      .startAngle(-Math.PI / 2);

    const radius =
      ((gaugeGroup.node() as unknown as SVGGraphicsElement | null)?.getBBox()
        ?.width ?? 0) / 2 || 1;
    const innerRadius = radius * 0.6;
    const outerRadius = radius;

    // Ensure the gauge arc never exceeds the half-donut range (-90° to +90°)
    const endAngle = -Math.PI / 2 + (Math.PI * pct) / 100;

    gaugeGroup
      .select("path.gauge-fill")
      .attr(
        "d",
        arc({
          endAngle,
          innerRadius,
          outerRadius,
        }) as unknown as string
      )
      .attr("fill", config.gaugeColor);

    gaugeGroup
      .select("text.gauge-text")
      .text(`${humanRate(value)} (${pct.toFixed(0)}%)`);
  }

  dispose(): void {
    this.svg?.remove();
    this.histSvg?.remove();
    this.gaugeSvg?.remove();
    this.svg = null;
    this.histSvg = null;
    this.gaugeSvg = null;
    this.gaugeGroup = null;
  }

  private async loadD3(): Promise<D3Module | null> {
    if (this.d3) return this.d3;
    if (typeof window === "undefined") return null;

    try {
      const mod = await import("d3");
      this.d3 = mod;
      return mod;
    } catch {
      this.d3 = null;
      return null;
    }
  }
}

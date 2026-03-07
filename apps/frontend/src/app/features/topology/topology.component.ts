/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { DataSourceService } from "../../services/data-source.service";
import { MockDataService } from "../../services/mock-data.service";
import {
  LoadProfilePct,
  LoadProfileService,
} from "../../services/load-profile.service";
import { MatDialog } from "@angular/material/dialog";
import {
  TopologyInfoDialogComponent,
  TopologyInfoDialogData,
} from "./topology-info-dialog.component";
// d3 is ESM; load dynamically at runtime to avoid Jest/node transform issues
let _d3: D3Module | null = null;

type TopoNode = {
  id: string;
  label?: string;
  group?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
};
type TopoLink = {
  source: string | TopoNode;
  target: string | TopoNode;
  value?: number;
};

type D3DragEvent = { x: number; y: number; subject?: unknown; active?: number };

type D3Selection = {
  append: (tag: string) => D3Selection;
  attr: (name: string, value?: unknown) => D3Selection;
  select: (sel?: string) => D3Selection;
  selectAll: (sel: string) => D3Selection;
  data: (d: unknown[]) => D3Selection;
  enter: () => D3Selection;
  call: (fn: ((sel: D3Selection) => void) | unknown) => D3Selection;
  on?: (
    event: string,
    handler: (event?: unknown, datum?: unknown) => void
  ) => void;
  text: (t?: unknown) => D3Selection;
  remove?: () => void;
};

type D3Drag = {
  on: (
    ev: string,
    handler: (event: D3DragEvent, d: TopoNode) => void
  ) => D3Drag;
};

type D3Simulation = {
  stop: () => void;
  alphaTarget: (n: number) => D3Simulation;
  restart?: () => void;
  on: (ev: string, cb: () => void) => D3Simulation;
  force: (name: string, f: unknown) => D3Simulation;
};

type D3Module = {
  select: (el: Element | HTMLElement) => D3Selection;
  drag: () => D3Drag;
  forceSimulation: (nodes: TopoNode[]) => D3Simulation;
  forceLink: (links: TopoLink[]) => {
    id: (fn: (d: TopoNode) => string) => { distance: (n: number) => unknown };
  };
  forceManyBody: () => { strength: (n: number) => unknown };
  forceCenter: (x: number, y: number) => unknown;
  arc?: (...args: unknown[]) => unknown;
  bin?: (...args: unknown[]) => unknown;
  scaleTime?: (...args: unknown[]) => unknown;
  scaleLinear?: (...args: unknown[]) => unknown;
  extent?: (...args: unknown[]) => unknown;
};

type LinkStats = {
  throughput?: string;
  throughputPct?: string;
  latencyMs?: number;
  errorRate?: string;
  throughputMBpsCurrent?: number;
  throughputMBpsMax?: number;
  throughputPctNumeric?: number;
};

type TopologyMetricPoint = {
  currentMBps: number;
  maxMBps?: number;
};

type TopologyMetricsResponse = Record<string, TopologyMetricPoint> & {
  timing_drift_ns?: number;
  rfi_event_rate?: number;
};
@Component({
  selector: "app-topology",
  templateUrl: "./topology.component.html",
  styleUrls: ["./topology.component.scss"],
})
export class TopologyComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("graph", { static: true }) graphEl!: ElementRef<HTMLDivElement>;

  private svg?: D3Selection | null;
  private simulation?: D3Simulation | null;
  private d3: D3Module | null = null;

  public loading = false;
  public lastError: string | null = null;
  public topologySource: "live" | "mock" | "unavailable" = "live";
  public hasTopologyData = false;
  public showMode: "live" | "max" = "live";
  public aggCurrentMBps = 0;
  public aggMaxMBps = 0;
  // mission‑closure metrics
  public timingDriftNs?: number;
  public rfiEventRate?: number;
  public initialLoadSettled = false;
  // Configurable capacity settings
  public showSettings = false;
  public defaultPerChannelMBps = 1250; // default per-channel capacity (MB/s)
  public perLinkCapacity: Record<string, number> = {};
  public settingsJson = "";
  // live polling controls (exposed in UI)
  public pollIntervalSec = 5;
  public sensitivityPct = 5; // percent change threshold to animate
  public profilePct: LoadProfilePct = 10;
  // last rendered topology (kept so settings UI can auto-populate)
  private lastNodes: TopoNode[] = [];
  private lastLinks: TopoLink[] = [];
  // live polling interval id
  private livePollInterval: number | null = null;
  private profileSub?: { unsubscribe: () => void };
  // friendly per-link form entries for settings UI
  public perLinkEntries: Array<{
    key: string;
    source: string;
    target: string;
    channels: number;
    configuredMBps: number;
    observedCurrentMBps?: number;
    observedMaxMBps?: number;
    utilPct?: number;
  }> = [];

  constructor(
    private http: HttpClient,
    private dialog: MatDialog,
    private dataSource: DataSourceService,
    private mock: MockDataService,
    private loadProfile: LoadProfileService
  ) {}

  ngOnInit(): void {
    this.profilePct = this.loadProfile.current;
    this.syncProfileControls(this.profilePct);
    this.profileSub = this.loadProfile.profile$.subscribe((pct) => {
      this.profilePct = pct;
      this.syncProfileControls(pct);
      if (this.lastLinks.length > 0) {
        this.render(this.lastNodes, this.lastLinks, true);
        if (this.showMode === "live") {
          this.restartLivePoll();
        }
      }
    });
  }

  private safeId(s: string): string {
    return "path_" + s.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private getLinkKey(l: TopoLink): string {
    const s =
      typeof l.source === "string" ? l.source : (l.source as TopoNode).id;
    const t =
      typeof l.target === "string" ? l.target : (l.target as TopoNode).id;
    return `${s}->${t}`;
  }

  private statsRef(l: TopoLink): { _stats?: LinkStats } {
    return l as unknown as { _stats?: LinkStats };
  }

  private loadSettings() {
    try {
      const d = localStorage.getItem("topology.defaultPerChannelMBps");
      if (d)
        this.defaultPerChannelMBps = Number(d) || this.defaultPerChannelMBps;
      const j = localStorage.getItem("topology.perLinkCapacity");
      if (j) this.perLinkCapacity = JSON.parse(j) as Record<string, number>;
    } catch {
      return;
    }
  }

  public toggleSettings() {
    this.showSettings = !this.showSettings;
    if (this.showSettings) {
      this.populatePerLinkEntries();
    }
  }

  public setMode(m: "live" | "max") {
    this.showMode = m;
    if (m === "live") {
      this.startLivePoll();
    } else {
      this.stopLivePoll();
    }
  }

  private populatePerLinkEntries() {
    this.perLinkEntries = [];
    for (const ln of this.lastLinks ?? []) {
      const key = this.getLinkKey(ln);
      const channels = Number(ln.value ?? 1) || 1;
      const configured =
        Number(this.perLinkCapacity[key] ?? this.defaultPerChannelMBps) ||
        this.defaultPerChannelMBps;
      const stats = this.statsRef(ln)._stats;
      const observedCur = Number(stats?.throughputMBpsCurrent ?? NaN);
      const observedMax = Number(stats?.throughputMBpsMax ?? NaN);
      const util =
        Number.isFinite(observedCur) &&
        Number.isFinite(observedMax) &&
        observedMax > 0
          ? Math.round((observedCur / observedMax) * 100)
          : undefined;
      this.perLinkEntries.push({
        key,
        source:
          typeof ln.source === "string"
            ? ln.source
            : (ln.source as TopoNode).id,
        target:
          typeof ln.target === "string"
            ? ln.target
            : (ln.target as TopoNode).id,
        channels,
        configuredMBps: configured,
        observedCurrentMBps: Number.isFinite(observedCur)
          ? observedCur
          : undefined,
        observedMaxMBps: Number.isFinite(observedMax) ? observedMax : undefined,
        utilPct: util,
      });
    }
    this.settingsJson = JSON.stringify(this.perLinkCapacity || {}, null, 2);
  }

  public saveSettings() {
    // persist perLinkEntries into perLinkCapacity map
    for (const e of this.perLinkEntries) {
      if (e.configuredMBps && e.configuredMBps > 0)
        this.perLinkCapacity[e.key] = e.configuredMBps;
      else delete this.perLinkCapacity[e.key];
    }
    try {
      localStorage.setItem(
        "topology.perLinkCapacity",
        JSON.stringify(this.perLinkCapacity)
      );
      localStorage.setItem(
        "topology.defaultPerChannelMBps",
        String(this.defaultPerChannelMBps)
      );
    } catch {
      return;
    }
    this.showSettings = false;
    // re-render to pick up changed capacities
    this.render(this.lastNodes, this.lastLinks, true);
  }

  private syncProfileControls(pct: LoadProfilePct): void {
    switch (pct) {
      case 10:
        this.pollIntervalSec = 8;
        this.sensitivityPct = 10;
        break;
      case 25:
        this.pollIntervalSec = 5;
        this.sensitivityPct = 8;
        break;
      case 50:
        this.pollIntervalSec = 3;
        this.sensitivityPct = 6;
        break;
      case 100:
        this.pollIntervalSec = 1;
        this.sensitivityPct = 4;
        break;
    }
  }

  private restartLivePoll(): void {
    if (this.showMode === "live") {
      this.startLivePoll();
    }
  }

  private loadScale(): number {
    return this.profilePct / 100;
  }

  private linkActivityBias(key: string): number {
    const hash = Array.from(key).reduce(
      (acc, char) => acc + char.charCodeAt(0),
      0
    );
    return 0.45 + (hash % 45) / 100;
  }

  private syntheticLatencyMs(l: TopoLink): number {
    const channels = Number(l.value ?? 1) || 1;
    return Math.round(8 + channels * 4 + this.loadScale() * 14);
  }

  private syntheticErrorRate(l: TopoLink): string {
    const channels = Number(l.value ?? 1) || 1;
    return `${(channels * 0.01 + this.loadScale() * 0.08).toFixed(2)}%`;
  }

  private normalizeTopologyMetricsResponse(
    res: TopologyMetricsResponse | Record<string, unknown> | null | undefined
  ): Record<string, TopologyMetricPoint> {
    const normalized: Record<string, TopologyMetricPoint> = {};
    const source = res as Record<string, unknown>;
    if (!source || typeof source !== "object") {
      return normalized;
    }

    this.mergeMetricMap(normalized, source);

    const links = source["links"];
    if (links && typeof links === "object") {
      this.mergeMetricMap(normalized, links as Record<string, unknown>);
    }

    const payload = source["payload"] as
      | { data?: { result?: Array<Record<string, unknown>> } }
      | undefined;
    const results = payload?.data?.result;
    if (Array.isArray(results)) {
      for (const entry of results) {
        const metric = (entry["metric"] || {}) as Record<string, unknown>;
        const link = String(
          metric["link"] ??
            this.composeLinkKey(
              metric["source"] as string | undefined,
              metric["target"] as string | undefined
            ) ??
            ""
        );
        if (!link) continue;
        const value = entry["value"] as [number, string] | undefined;
        const parsed = Number(value?.[1] ?? 0);
        normalized[link] = {
          currentMBps: Math.max(0, parsed / (1024 * 1024)),
          maxMBps: normalized[link]?.maxMBps,
        };
      }
    }

    return normalized;
  }

  private mergeMetricMap(
    target: Record<string, TopologyMetricPoint>,
    source: Record<string, unknown>
  ): void {
    for (const [key, value] of Object.entries(source)) {
      if (
        key === "source" ||
        key === "payload" ||
        key === "links" ||
        key === "timing_drift_ns" ||
        key === "rfi_event_rate"
      ) {
        continue;
      }
      if (!value || typeof value !== "object") {
        continue;
      }
      const metric = value as Record<string, unknown>;
      const currentMBps = Number(metric["currentMBps"]);
      const maxMBps = Number(metric["maxMBps"]);
      if (!Number.isFinite(currentMBps) && !Number.isFinite(maxMBps)) {
        continue;
      }
      target[key] = {
        currentMBps: Number.isFinite(currentMBps) ? currentMBps : 0,
        maxMBps: Number.isFinite(maxMBps) ? maxMBps : undefined,
      };
    }
  }

  private applyMetricToLink(
    ln: TopoLink,
    metrics?: Record<string, TopologyMetricPoint>
  ): boolean {
    const metric = this.metricForLink(metrics, ln);
    if (!metric) return false;
    const stats = this.statsRef(ln)._stats ?? ({} as LinkStats);
    this.populateStatsFromMetric(stats, metric);
    stats.latencyMs = this.syntheticLatencyMs(ln);
    stats.errorRate = this.syntheticErrorRate(ln);
    this.statsRef(ln)._stats = stats;
    return true;
  }

  private populateStatsFromMetric(
    stats: LinkStats,
    metric: TopologyMetricPoint
  ): void {
    stats.throughputMBpsCurrent = metric.currentMBps;
    if (metric.maxMBps !== undefined) {
      stats.throughputMBpsMax = metric.maxMBps;
    }
    const current = Math.round(stats.throughputMBpsCurrent ?? 0);
    const max = Math.round(
      stats.throughputMBpsMax ?? stats.throughputMBpsCurrent ?? 0
    );
    const pct = Math.round(
      ((stats.throughputMBpsCurrent ?? 0) / Math.max(1, max || 1)) * 100
    );
    stats.throughput = `${current} MB/s (max ${max} MB/s)`;
    stats.throughputPct = `${pct}%`;
    stats.throughputPctNumeric = pct;
  }

  private metricForLink(
    metrics: Record<string, TopologyMetricPoint> | undefined,
    link: TopoLink
  ): TopologyMetricPoint | null {
    const key = this.getLinkKey(link);
    if (metrics?.[key]) {
      return metrics[key];
    }
    for (const alias of this.linkAliases(key)) {
      if (metrics?.[alias]) {
        return metrics[alias];
      }
    }

    const channels = Number(link.value ?? 1) || 1;
    const maxMBps = Math.round(
      channels *
        (Number(this.perLinkCapacity[key] ?? this.defaultPerChannelMBps) ||
          this.defaultPerChannelMBps)
    );
    return {
      currentMBps: Math.round(
        maxMBps *
          Math.min(
            1,
            Math.max(0.04, this.loadScale() * this.linkActivityBias(key))
          )
      ),
      maxMBps,
    };
  }

  private linkAliases(key: string): string[] {
    const replacements: Record<string, string[]> = {
      "dg-main": ["generator"],
      backend: ["governance"],
      "java-governance": ["governance"],
    };
    const aliases = new Set<string>();
    const [source, target] = key.split("->");
    const sourceVariants = [source, ...(replacements[source] ?? [])];
    const targetVariants = [target, ...(replacements[target] ?? [])];
    for (const s of sourceVariants) {
      for (const t of targetVariants) {
        aliases.add(`${s}->${t}`);
      }
    }
    return Array.from(aliases).filter((alias) => alias !== key);
  }

  private composeLinkKey(source?: string, target?: string): string | undefined {
    if (!source || !target) return undefined;
    return `${source}->${target}`;
  }

  private linkUtilization(stats?: LinkStats): number {
    return Number(
      stats?.throughputPctNumeric ??
        ((stats?.throughputMBpsCurrent ?? 0) /
          Math.max(1, stats?.throughputMBpsMax ?? 1)) *
          100
    );
  }

  private particleCountForStats(stats?: LinkStats): number {
    const util = this.linkUtilization(stats);
    if (util >= 90) return 5;
    if (util >= 70) return 4;
    if (util >= 45) return 3;
    if (util >= 20) return 2;
    return 1;
  }

  private particleDurationSec(stats?: LinkStats): number {
    const util = this.linkUtilization(stats);
    return Math.max(0.45, 4.8 - util / 22);
  }

  private particleRadius(stats?: LinkStats): number {
    const util = this.linkUtilization(stats);
    if (util >= 90) return 5.5;
    if (util >= 60) return 4.8;
    if (util >= 30) return 4.2;
    return 3.6;
  }

  private particleColor(stats?: LinkStats): string {
    const util = this.linkUtilization(stats);
    if (util >= 90) return "#2563eb";
    if (util >= 65) return "#1d4ed8";
    if (util >= 35) return "#3b82f6";
    return "#60a5fa";
  }

  private syncParticlesForLink(
    svgEl: SVGSVGElement,
    key: string,
    stats?: LinkStats
  ): void {
    const desiredCount = this.particleCountForStats(stats);
    const durationSec = this.particleDurationSec(stats);
    const radius = this.particleRadius(stats);
    const fill = this.particleColor(stats);
    const existing = Array.from(
      svgEl.querySelectorAll(`.flow-particle[data-key="${key}"]`)
    ) as SVGCircleElement[];

    existing.slice(desiredCount).forEach((node) => node.remove());

    for (let i = existing.length; i < desiredCount; i++) {
      const particle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      particle.setAttribute("class", "flow-particle");
      particle.setAttribute("data-key", key);

      const anim = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "animateMotion"
      );
      anim.setAttribute("repeatCount", "indefinite");
      anim.setAttribute("rotate", "auto");
      anim.setAttribute("begin", `${(i * durationSec) / desiredCount}s`);
      const mpath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "mpath"
      );
      mpath.setAttribute("href", `#${this.safeId(key)}`);
      anim.appendChild(mpath);
      particle.appendChild(anim);
      svgEl.appendChild(particle);
    }

    const particles = Array.from(
      svgEl.querySelectorAll(`.flow-particle[data-key="${key}"]`)
    ) as SVGCircleElement[];
    particles.forEach((particle, index) => {
      particle.setAttribute("r", `${radius}`);
      particle.setAttribute("fill", fill);
      particle.setAttribute(
        "opacity",
        `${Math.max(0.38, 0.95 - index * 0.12)}`
      );
      const animEl = particle.querySelector(
        "animateMotion"
      ) as SVGAnimateElement | null;
      if (animEl) {
        animEl.setAttribute("dur", `${durationSec}s`);
        animEl.setAttribute(
          "begin",
          `${(index * durationSec) / desiredCount}s`
        );
      }
    });
  }

  // Fetch metrics from backend Prometheus adapter at /api/metrics/topology
  // Expected shape: { "source->target": { currentMBps: number, maxMBps?: number } }
  private fetchMetrics() {
    if (this.dataSource.mode === "mock") {
      const keys = (this.lastLinks ?? []).map((l) => this.getLinkKey(l));
      this.mock
        .topologyMetricsForLinks(keys)
        .subscribe((res: TopologyMetricsResponse) => {
          const metrics = this.normalizeTopologyMetricsResponse(res);
          this.captureMissionMetrics(res);
          let changed = false;
          for (const ln of this.lastLinks ?? []) {
            changed = this.applyMetricToLink(ln, metrics) || changed;
          }
          if (changed) this.render(this.lastNodes, this.lastLinks, true);
        });
      return;
    }

    this.http.get<TopologyMetricsResponse>("/api/metrics/topology").subscribe(
      (res) => {
        const metrics = this.normalizeTopologyMetricsResponse(res);
        this.captureMissionMetrics(res);
        let changed = false;
        for (const ln of this.lastLinks ?? []) {
          changed = this.applyMetricToLink(ln, metrics) || changed;
        }
        if (changed) {
          // re-render to update visuals; avoid triggering another metrics fetch
          this.render(this.lastNodes, this.lastLinks, true);
        }
      },
      () => {
        this.lastError =
          "Live topology metrics are unavailable. Showing last known topology structure.";
      }
    );
  }

  async ngAfterViewInit(): Promise<void> {
    await this.initSvg();
    this.loadTopology();
    window.addEventListener("resize", this.onResize);
  }

  ngOnDestroy(): void {
    this.simulation?.stop();
    window.removeEventListener("resize", this.onResize);
    this.profileSub?.unsubscribe();
    this.stopLivePoll();
  }

  private async initSvg() {
    const el = this.graphEl.nativeElement;
    const w = el.clientWidth || 800;
    const h = Math.max(360, el.clientHeight || 480);
    await this.loadD3();
    const d3 = this.d3 as D3Module;
    this.svg = d3
      .select(el)
      .append("svg")
      .attr("width", "100%")
      .attr("height", h)
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    this.svg.append("g").attr("class", "links");
    this.svg.append("g").attr("class", "nodes");
  }

  private async loadD3() {
    if (this.d3) return this.d3;
    if (_d3) {
      this.d3 = _d3;
      return this.d3;
    }
    try {
      // dynamic import keeps Jest from attempting to statically parse ESM d3
      const mod = await import("d3");
      _d3 = mod;
      this.d3 = mod;
      return this.d3;
    } catch (_err) {
      // fallback: provide a minimal stub so tests can run without d3
      const selection: D3Selection = {} as D3Selection;
      selection.append = (_tag: string) => selection;
      selection.attr = (_name: string, _value?: unknown) => selection;
      selection.select = (_sel?: string) => selection;
      selection.selectAll = (_sel: string) => selection;
      selection.data = (_d: unknown[]) => selection;
      selection.enter = () => selection;
      selection.call = (_fn: unknown) => selection;
      selection.text = (_t?: unknown) => selection;
      selection.remove = () => selection;

      const dragStub: D3Drag = {
        on: (
          _ev: string,
          _handler: (event: D3DragEvent, d: TopoNode) => void
        ) => dragStub,
      };

      const simStub: D3Simulation = {
        stop: () => {},
        alphaTarget: (_n: number) => simStub,
        restart: () => {},
        on: (_ev: string, _cb: () => void) => simStub,
        force: (_name: string, _f: unknown) => simStub,
      };

      this.d3 = {
        select: () => selection,
        drag: () => dragStub,
        forceSimulation: (_nodes: TopoNode[]) => simStub,
        forceLink: (_links: TopoLink[]) => ({
          id: () => ({ distance: () => ({}) }),
        }),
        forceManyBody: () => ({ strength: () => ({}) }),
        forceCenter: (_x: number, _y: number) => ({}),
      };
      return this.d3;
    }
  }

  private render(nodes: TopoNode[], links: TopoLink[], skipFetch = false) {
    if (!this.svg) return;
    this.svg.selectAll("*").remove?.();
    const el = this.graphEl.nativeElement;
    const w = el.clientWidth || 800;
    const h = Math.max(360, el.clientHeight || 480);
    this.svg.attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);

    const linkGroup = this.svg.append("g").attr("class", "links");
    const nodeGroup = this.svg.append("g").attr("class", "nodes");

    const d3 = this.d3 as D3Module;
    // attach precomputed stats to links and compute aggregates (use numeric fields when available)
    this.aggCurrentMBps = 0;
    this.aggMaxMBps = 0;
    links.forEach((ln) => {
      const stats = this.linkStats(ln);
      this.statsRef(ln)._stats = stats;
      const cur = Number(stats?.throughputMBpsCurrent ?? NaN);
      const max = Number(stats?.throughputMBpsMax ?? NaN);
      this.aggCurrentMBps += Number.isFinite(cur) ? cur : 0;
      this.aggMaxMBps += Number.isFinite(max) ? max : 0;
    });

    // store last nodes/links for settings UI and optional metrics overlay
    this.lastNodes = nodes;
    this.lastLinks = links;
    const link = linkGroup
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("data-key", (ln: TopoLink) => this.getLinkKey(ln))
      .attr("stroke", "rgba(148, 163, 184, 0.34)")
      .attr("stroke-width", (d: TopoLink) =>
        d.value ? Math.max(1, Math.log(d.value + 1)) : 1
      );

    // add small clickable dots at link midpoints
    const linkDot = linkGroup
      .selectAll(".link-dot")
      .data(links)
      .enter()
      .append("circle")
      .attr("class", "link-dot")
      .attr("data-key", (ln: TopoLink) => this.getLinkKey(ln))
      .attr("r", 5)
      // color fill/stroke to indicate utilization/bottleneck
      .attr("fill", (ln: TopoLink) => {
        const stats = this.statsRef(ln)._stats;
        const cur = Number(stats?.throughputMBpsCurrent ?? 0);
        const max = Number(stats?.throughputMBpsMax ?? 1);
        const util = max > 0 ? (cur / max) * 100 : 0;
        if (util >= 95) return "#ef4444"; // red (critical)
        if (util >= 75) return "#f97316"; // orange (high)
        if (util >= 50) return "#f59e0b"; // amber
        return "#ffffff";
      })
      .attr("stroke", (ln: TopoLink) => {
        const stats = this.statsRef(ln)._stats;
        const cur = Number(stats?.throughputMBpsCurrent ?? 0);
        const max = Number(stats?.throughputMBpsMax ?? 1);
        const util = max > 0 ? (cur / max) * 100 : 0;
        if (util >= 95) return "#7f1d1d";
        if (util >= 75) return "#7c2d12";
        if (util >= 50) return "#7c2e0a";
        return "#6b7280";
      })
      .attr("stroke-width", 1)
      .attr("style", "cursor:pointer")
      .call((s: D3Selection) => {
        if (s.on)
          s.on("click", (_ev: unknown, datum: unknown) =>
            this.openLinkInfo(datum as TopoLink)
          );
      });

    // create invisible svg path elements for animateMotion and flow particles
    const path = linkGroup
      .selectAll(".link-path")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "link-path")
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("data-key", (ln: TopoLink) => this.getLinkKey(ln))
      .attr("id", (ln: TopoLink) => this.safeId(this.getLinkKey(ln)));

    // DOM-create per-link flow particles that follow the path via <animateMotion>
    try {
      const svgEl = this.graphEl.nativeElement.querySelector(
        "svg"
      ) as SVGSVGElement | null;
      if (svgEl) {
        // remove any existing flow particles (defensive)
        Array.from(svgEl.querySelectorAll(".flow-particle")).forEach((n) =>
          n.remove()
        );
        for (const ln of links) {
          const key = this.getLinkKey(ln);
          this.syncParticlesForLink(svgEl, key, this.statsRef(ln)._stats);
        }
      }
    } catch (e) {
      void e;
    }

    const node = nodeGroup
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .call(
        d3
          .drag()
          .on("start", (event: D3DragEvent, d: TopoNode) =>
            this.dragstarted(event, d)
          )
          .on("drag", (event: D3DragEvent, d: TopoNode) =>
            this.dragged(event, d)
          )
          .on("end", (event: D3DragEvent, d: TopoNode) =>
            this.dragended(event, d)
          )
      );

    node
      .append("circle")
      .attr("r", 14)
      .attr("fill", (d: TopoNode) => {
        if (d.group === "ngvla") return "#4caf50"; // Green for ngVLA array segments
        if (d.group === "infra") return "#90caf9"; // Blue for infrastructure
        return "#ffd54f"; // Yellow for application nodes
      })
      .attr("stroke", "#0f172a");
    node
      .append("text")
      .attr("x", 18)
      .attr("y", 4)
      .attr("font-size", 12)
      .attr("fill", "#f8fafc")
      .attr("font-weight", 600)
      .attr("paint-order", "stroke")
      .attr("stroke", "rgba(2, 6, 23, 0.9)")
      .attr("stroke-width", 3)
      .attr("stroke-linejoin", "round")
      .text((d: TopoNode) => d.label ?? d.id);

    this.simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: TopoNode) => d.id)
          .distance(80)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .on("tick", () => {
        link.attr("x1", (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          return s.x ?? 0;
        });
        link.attr("y1", (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          return s.y ?? 0;
        });
        link.attr("x2", (ln: TopoLink) => {
          const t = ln.target as TopoNode;
          return t.x ?? 0;
        });
        link.attr("y2", (ln: TopoLink) => {
          const t = ln.target as TopoNode;
          return t.y ?? 0;
        });

        // update path d attribute to match the link line so animateMotion follows
        path.attr("d", (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          const t = ln.target as TopoNode;
          const sx = Math.round(s.x ?? 0);
          const sy = Math.round(s.y ?? 0);
          const tx = Math.round(t.x ?? 0);
          const ty = Math.round(t.y ?? 0);
          return `M ${sx} ${sy} L ${tx} ${ty}`;
        });

        // update particle element positions/durations if needed
        try {
          const svgEl = this.graphEl.nativeElement.querySelector(
            "svg"
          ) as SVGSVGElement | null;
          if (svgEl) {
            for (const ln of links) {
              const key = this.getLinkKey(ln);
              const stats = this.statsRef(ln)._stats;
              this.syncParticlesForLink(svgEl, key, stats);
            }
          }
        } catch (e) {
          void e;
        }

        node.attr(
          "transform",
          (nd: TopoNode) => `translate(${nd.x ?? 0},${nd.y ?? 0})`
        );
        // update link dot positions to midpoint of links
        if (linkDot) {
          linkDot.attr("cx", (ln: TopoLink) => {
            const s = ln.source as TopoNode;
            const t = ln.target as TopoNode;
            const sx = s.x ?? 0;
            const tx = t.x ?? 0;
            return (sx + tx) / 2;
          });
          linkDot.attr("cy", (ln: TopoLink) => {
            const s = ln.source as TopoNode;
            const t = ln.target as TopoNode;
            const sy = s.y ?? 0;
            const ty = t.y ?? 0;
            return (sy + ty) / 2;
          });
        }
      });
    node.on?.("click", (_event: unknown, datum: unknown) =>
      this.openNodeInfo(datum as TopoNode)
    );

    // after render, start live polling if requested; otherwise try a one-off fetch
    if (!skipFetch) {
      if (this.showMode === "live") {
        this.startLivePoll();
      } else {
        this.stopLivePoll();
        this.fetchMetrics();
      }
    }
  }

  private startLivePoll() {
    this.stopLivePoll();
    // immediate poll
    this.pollMetricsAndAnimate();
    // poll every pollIntervalSec seconds
    this.livePollInterval = window.setInterval(
      () => this.pollMetricsAndAnimate(),
      Math.max(1000, Math.round(this.pollIntervalSec * 1000))
    );
  }

  private stopLivePoll() {
    if (this.livePollInterval != null) {
      clearInterval(this.livePollInterval);
      this.livePollInterval = null;
    }
  }

  private pollMetricsAndAnimate() {
    if (this.dataSource.mode === "mock") {
      this.fetchMetrics();
      return;
    }
    this.http.get<TopologyMetricsResponse>("/api/metrics/topology").subscribe(
      (res) => {
        this.lastError = null;
        const metrics = this.normalizeTopologyMetricsResponse(res);
        this.captureMissionMetrics(res);
        for (const ln of this.lastLinks ?? []) {
          const key = this.getLinkKey(ln);
          const prev = this.statsRef(ln)._stats;
          const m = this.metricForLink(metrics, ln);
          if (m) {
            const stats = prev ?? ({} as LinkStats);
            const prevVal = Number(stats.throughputMBpsCurrent ?? 0);
            this.populateStatsFromMetric(stats, m);
            stats.latencyMs = this.syntheticLatencyMs(ln);
            stats.errorRate = this.syntheticErrorRate(ln);
            this.statsRef(ln)._stats = stats;
            // animate if change significant by percentage of max or sensitivityPct
            const maxVal = Number(stats.throughputMBpsMax ?? 1);
            const delta = Math.abs((m.currentMBps || 0) - prevVal);
            const pctChange = maxVal > 0 ? (delta / maxVal) * 100 : 0;
            // adjust particle speed based on utilization (immediate)
            try {
              const svgEl = this.graphEl.nativeElement.querySelector(
                "svg"
              ) as SVGSVGElement | null;
              if (svgEl) {
                this.syncParticlesForLink(svgEl, key, stats);
              }
            } catch {
              return;
            }
            if (pctChange >= this.sensitivityPct) {
              this.animatePulse(key, prevVal, m.currentMBps || 0);
              this.flashLine(key);
            }
          }
        }
        this.render(this.lastNodes, this.lastLinks, true);
      },
      () => {
        this.lastError =
          "Live topology metrics polling failed. Graph structure is preserved, but link activity may be stale.";
      }
    );
  }

  private animatePulse(key: string, prev: number, next: number) {
    try {
      const svgEl = this.graphEl.nativeElement.querySelector(
        "svg"
      ) as SVGSVGElement | null;
      if (!svgEl) return;
      const selector = `.link-dot[data-key="${key}"]`;
      const el = svgEl.querySelector(selector) as SVGCircleElement | null;
      if (!el) return;
      // scale pulse
      el.animate(
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(1.8)", opacity: 0.6 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 700, easing: "ease-in-out" }
      );
      // brief stroke width flash on parent line
      // nothing more here; flash handled by separate function
    } catch (e) {
      void e;
    }
  }

  private flashLine(key: string) {
    try {
      const svgEl = this.graphEl.nativeElement.querySelector(
        "svg"
      ) as SVGSVGElement | null;
      if (!svgEl) return;
      const line = svgEl.querySelector(
        `line[data-key="${key}"]`
      ) as SVGLineElement | null;
      if (!line) return;
      const original = line.getAttribute("stroke");
      const anim = line.animate(
        [
          { stroke: original ?? "#bdbdbd", strokeWidth: "1px" },
          { stroke: "#fffbeb", strokeWidth: "4px" },
          { stroke: original ?? "#bdbdbd", strokeWidth: "1px" },
        ],
        { duration: 800, easing: "ease-in-out" }
      );
      anim.onfinish = () => {
        try {
          line.setAttribute("stroke", original || "#bdbdbd");
          line.setAttribute("stroke-width", "1");
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
  }

  private captureMissionMetrics(res: TopologyMetricsResponse): void {
    if (typeof res.timing_drift_ns === "number") {
      this.timingDriftNs = res.timing_drift_ns;
    }
    if (typeof res.rfi_event_rate === "number") {
      this.rfiEventRate = res.rfi_event_rate;
    }
  }

  private openNodeInfo(n: TopoNode) {
    const desc = this.nodeDescription(n);
    this.openInfoDialog({
      type: "node",
      id: n.id,
      label: n.label,
      group: n.group,
      description: desc,
    });
  }

  private openLinkInfo(l: TopoLink) {
    const s =
      typeof l.source === "string" ? l.source : (l.source as TopoNode).id;
    const t =
      typeof l.target === "string" ? l.target : (l.target as TopoNode).id;
    // Prefer attached stats if available (computed at render time), otherwise compute fresh
    const stats = this.statsRef(l)._stats ?? this.linkStats(l);
    this.openInfoDialog({
      type: "link",
      source: s,
      target: t,
      value: l.value ?? 0,
      stats,
    });
  }

  private openInfoDialog(data: TopologyInfoDialogData) {
    if (!this.dialog) return;
    this.dialog.open(TopologyInfoDialogComponent, { data, width: "520px" });
  }

  private nodeDescription(n: TopoNode): string {
    // richer node descriptions (brief researched summaries)
    const id = n.id;
    const label = n.label ?? n.id;
    switch (id) {
      case "backend":
        return `${label} — Nest.js SSR/API server. Handles server-side rendering, API aggregation, and acts as a gateway between frontend and backend services.`;
      case "frontend":
        return `${label} — Angular frontend (SPA) responsible for operator UI, visualization, and user interactions.`;
      case "kafka":
        return `${label} — Apache Kafka message broker for streaming ingest and pipeline handoff (topics, partitions, retention).`;
      case "pulsar":
        return `${label} — Apache Pulsar message broker for streaming ingest and pipeline handoff (topics, partitions, retention).`;
      case "rabbitmq":
        return `${label} — RabbitMQ message broker for control plane messaging and job coordination.`;
      case "minio":
        return `${label} — MinIO S3-compatible object store used for storing raw, calibrated, and science products in dev environments.`;
      case "prom":
      case "prometheus":
        return `${label} — Prometheus metrics server that scrapes instrument and application metrics (counters, gauges, histograms) and powers alerts and dashboards.`;
      case "grafana":
        return `${label} — Grafana dashboarding and visualization platform; queries Prometheus/Elasticsearch to render operational and scientific dashboards.`;
      case "loki":
        return `${label} — Grafana Loki log aggregation for application and infra logs; indexes log streams and provides fast querying.`;
      case "alertmanager":
        return `${label} — Prometheus Alertmanager handles alert routing, silencing, and notification delivery based on configured alert rules.`;
      case "java-governance":
        return `${label} — Java governance service: job store, ETL stage transitions, manifest validation, and provenance recording.`;
      case "nginx":
        return `${label} — NGINX static/content server and reverse proxy used for serving assets and fronting services.`;
      case "dg-main":
        return `${label} — Data Generator (simulated telescope data streamer). Produces visibility payloads into Kafka for testing.`;
      case "array-main":
      case "array-lbl":
      case "array-sba":
        return `${label} — ngVLA antenna array segment. Produces raw visibilities that drive the ingest pipeline.`;
      default:
        if (n.group === "ngvla")
          return `${label} — an array segment representing a set of antennas.`;
        if (n.group === "infra")
          return `${label} — infrastructure service used by the platform.`;
        return `${label} — application/service.`;
    }
  }

  private linkStats(l: TopoLink): LinkStats {
    const stats = {} as LinkStats;
    const metric = this.metricForLink(undefined, l);
    if (metric) {
      this.populateStatsFromMetric(stats, metric);
    }
    stats.latencyMs = this.syntheticLatencyMs(l);
    stats.errorRate = this.syntheticErrorRate(l);
    return stats;
  }

  private dragstarted(event: D3DragEvent, d: TopoNode) {
    if (!this.simulation) return;
    if (!event.active) this.simulation.alphaTarget(0.3).restart?.();
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragged(event: D3DragEvent, d: TopoNode) {
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragended(event: D3DragEvent, d: TopoNode) {
    if (!this.simulation) return;
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  private onResize = () => {
    // re-render using last-known data (simple approach: reload)
    this.loadTopology();
  };

  public refresh() {
    this.loadTopology(true);
  }

  private loadTopology(forceApi = false) {
    this.loading = true;
    this.lastError = null;
    // In live mode, fail honestly instead of silently substituting mock data.
    const api = "/api/topology";
    if (this.dataSource.mode === "mock" && !forceApi) {
      this.topologySource = "mock";
      this.hasTopologyData = true;
      this.render(this.mockNodes(), this.mockLinks());
      this.loading = false;
      this.initialLoadSettled = true;
      return;
    }

    if (forceApi) {
      this.http.get<{ nodes: TopoNode[]; links: TopoLink[] }>(api).subscribe(
        (res) => {
          this.topologySource = "live";
          this.hasTopologyData = true;
          this.render(res.nodes ?? [], res.links ?? []);
          this.loading = false;
          this.initialLoadSettled = true;
        },
        () => {
          this.topologySource = "unavailable";
          this.hasTopologyData = false;
          this.clearGraph();
          this.lastError =
            "Live topology data is unavailable. Retry when the topology API is online.";
          this.loading = false;
          this.initialLoadSettled = true;
        }
      );
      return;
    }

    this.http.get<{ nodes: TopoNode[]; links: TopoLink[] }>(api).subscribe(
      (res) => {
        this.topologySource = "live";
        this.hasTopologyData = true;
        this.render(res.nodes ?? [], res.links ?? []);
        this.loading = false;
        this.initialLoadSettled = true;
      },
      () => {
        this.topologySource = "unavailable";
        this.hasTopologyData = false;
        this.clearGraph();
        this.lastError =
          "Live topology data is unavailable. Switch to mock mode or retry when the topology API is online.";
        this.loading = false;
        this.initialLoadSettled = true;
      }
    );
  }

  private clearGraph() {
    this.lastNodes = [];
    this.lastLinks = [];
    this.aggCurrentMBps = 0;
    this.aggMaxMBps = 0;
    this.svg?.selectAll("*").remove?.();
    this.stopLivePoll();
  }

  private mockNodes(): TopoNode[] {
    return [
      // Infrastructure nodes
      { id: "kafka", label: "Kafka", group: "infra" },
      { id: "backend", label: "Nest SSR", group: "app" },
      { id: "frontend", label: "Angular Frontend", group: "app" },
      { id: "minio", label: "MinIO", group: "infra" },
      { id: "pulsar", label: "Pulsar", group: "infra" },
      { id: "rabbitmq", label: "RabbitMQ", group: "infra" },
      { id: "redis", label: "Redis", group: "infra" },
      { id: "prom", label: "Prometheus", group: "infra" },
      { id: "grafana", label: "Grafana", group: "infra" },
      { id: "loki", label: "Loki", group: "infra" },
      { id: "alertmanager", label: "Alertmanager", group: "infra" },
      { id: "java-governance", label: "Java Governance", group: "app" },
      { id: "nginx", label: "NGINX (static)", group: "infra" },
      // ngVLA Array Segment nodes
      { id: "dg-main", label: "Data Generator (Main)", group: "ngvla" },
      { id: "array-main", label: "Main Array (214 × 18m)", group: "ngvla" },
      { id: "array-lbl", label: "Long Baseline (19 × 6m)", group: "ngvla" },
      { id: "array-sba", label: "SBA (19 × 18m)", group: "ngvla" },
    ];
  }

  private mockLinks(): TopoLink[] {
    return [
      // Infrastructure connections
      { source: "backend", target: "java-governance" },
      { source: "kafka", target: "backend" },
      { source: "pulsar", target: "kafka" },
      { source: "rabbitmq", target: "java-governance" },
      { source: "java-governance", target: "redis" },
      { source: "backend", target: "frontend" },
      { source: "frontend", target: "prom" },
      { source: "prom", target: "grafana" },
      { source: "loki", target: "grafana" },
      { source: "prom", target: "alertmanager" },
      { source: "java-governance", target: "kafka" },
      { source: "java-governance", target: "minio" },
      { source: "frontend", target: "nginx" },
      // ngVLA array segment connections
      { source: "dg-main", target: "kafka" },
      { source: "dg-main", target: "pulsar" },
      { source: "dg-main", target: "array-main" },
      { source: "dg-main", target: "array-lbl" },
      { source: "dg-main", target: "array-sba" },
      { source: "array-main", target: "minio", value: 3 },
      { source: "array-lbl", target: "minio", value: 2 },
      { source: "array-sba", target: "minio", value: 2 },
    ];
  }
}

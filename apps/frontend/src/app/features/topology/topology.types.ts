// ─── Topology domain types ────────────────────────────────────────────────────

export type TopoNode = {
  id: string;
  label?: string;
  group?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

export type TopoLink = {
  source: string | TopoNode;
  target: string | TopoNode;
  value?: number;
};

// ─── D3 type shims ────────────────────────────────────────────────────────────

export type D3DragEvent = {
  x: number;
  y: number;
  subject?: unknown;
  active?: number;
};

export type D3Selection = {
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
  node?: () => Element | null;
};

export type D3Drag = {
  on: (
    ev: string,
    handler: (event: D3DragEvent, d: TopoNode) => void
  ) => D3Drag;
};

export type D3Simulation = {
  stop: () => void;
  alpha: (n: number) => D3Simulation;
  alphaDecay: (n: number) => D3Simulation;
  alphaTarget: (n: number) => D3Simulation;
  restart?: () => void;
  velocityDecay: (n: number) => D3Simulation;
  on: (ev: string, cb: () => void) => D3Simulation;
  force: (name: string, f: unknown) => D3Simulation;
};

export type D3Module = {
  select: (el: Element | HTMLElement) => D3Selection;
  drag: () => D3Drag;
  forceSimulation: (nodes: TopoNode[]) => D3Simulation;
  forceLink: (links: TopoLink[]) => {
    id: (fn: (d: TopoNode) => string) => { distance: (n: number) => unknown };
  };
  forceCollide: (radius: number) => { strength: (n: number) => unknown };
  forceManyBody: () => { strength: (n: number) => unknown };
  forceCenter: (x: number, y: number) => unknown;
  arc?: (...args: unknown[]) => unknown;
  bin?: (...args: unknown[]) => unknown;
  scaleTime?: (...args: unknown[]) => unknown;
  scaleLinear?: (...args: unknown[]) => unknown;
  extent?: (...args: unknown[]) => unknown;
};

// ─── Metrics / stats types ────────────────────────────────────────────────────

export type LinkDataSource =
  | "prometheus"
  | "admin"
  | "derived"
  | "mock"
  | "unavailable";

export type LinkStats = {
  throughput?: string;
  throughputPct?: string;
  latencyMs?: number;
  errorRate?: string;
  confidencePct?: number;
  throughputMBpsCurrent?: number;
  throughputMBpsMax?: number;
  throughputPctNumeric?: number;
  source?: LinkDataSource;
  measurementPath?: string;
};

export type NodeSummary = {
  id: string;
  label: string;
  group?: string;
  ingressMBps: number;
  egressMBps: number;
  totalMBps: number;
  businessRatePerSec: number;
  businessBytesPerSec: number;
  executorLabels: string[];
  liveLinks: number;
  derivedLinks: number;
  mockLinks: number;
  unavailableLinks: number;
  primarySource: LinkDataSource;
};

export type TopologyMetricPoint = {
  currentMBps: number;
  maxMBps?: number;
  source?: LinkDataSource;
  latencyMs?: number;
  errorRatePct?: number;
  confidencePct?: number;
  measurementPath?: string;
};

export type ProvenanceFilter = "prometheus" | "admin" | "derived";

export type NodeActivityPoint = {
  businessRatePerSec?: number;
  businessBytesPerSec?: number;
  executorLabels?: string[];
};

export type TopologyMetricsResponse = Record<string, TopologyMetricPoint> & {
  timing_drift_ns?: number;
  rfi_event_rate?: number;
  nodeActivity?: Record<string, NodeActivityPoint>;
};

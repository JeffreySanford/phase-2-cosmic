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

/** Evidence state for a link. Distinct from the operator visibility filter. */
export type LinkEvidenceState =
  | "measured"
  | "stale"
  | "derived"
  | "declared"
  | "mock";

export type LinkStats = {
  throughput?: string;
  throughputPct?: string;
  latencyMs?: number | null;
  errorRate?: string;
  /** Null/absent means nothing measured this link; never defaulted to a grade. */
  confidencePct?: number | null;
  /** What the number is actually backed by. Drives the honesty label. */
  state?: LinkEvidenceState;
  /** Prometheus series behind the value, so a reader can verify it. */
  measurementSource?: string | null;
  measuredAt?: number | null;
  /** Null when unmeasured. Rendered as "no measurement", never as 0 MB/s. */
  throughputMBpsCurrent?: number | null;
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
  /** Null when no measurement backs this edge. Never synthesized. */
  currentMBps: number | null;
  maxMBps?: number;
  source?: LinkDataSource;
  latencyMs?: number | null;
  errorRatePct?: number | null;
  /** Null for `declared` and `mock`; absence is not a percentage. */
  confidencePct?: number | null;
  /** Evidence claim, kept separate from the `source` visibility filter. */
  state?: LinkEvidenceState;
  measurementSource?: string | null;
  measuredAt?: number | null;
  measurementPath?: string;
};

// Provenance filters are the operator's visibility control and stay as-is.
// Evidence honesty is carried separately by TopologyLinkStats.state, so an
// unmeasured link remains visible under these filters while still reporting
// "No measurement" rather than a fabricated confidence grade.
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

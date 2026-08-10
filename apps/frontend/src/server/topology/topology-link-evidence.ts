/**
 * Evidence model for topology link measurements.
 *
 * Replaces the previous behavior, where a link reported 92% "High confidence"
 * because its name appeared in a hardcoded list, and reported throughput derived
 * from its position in the links array. Both were synthetic values presented as
 * measurements.
 *
 * The rule here is simple and absolute: a number is only reported when a real
 * Prometheus series backs it. Absence of measurement is reported as absence.
 */

export type LinkEvidenceState =
  | "measured"
  | "stale"
  | "derived"
  | "declared"
  | "mock";

export interface LinkEvidence {
  /** Null whenever no measurement backs this edge. Never synthesized. */
  throughputMBps: number | null;
  state: LinkEvidenceState;
  /** Null for `declared` and `mock`; absence is not a percentage. */
  confidencePct: number | null;
  /** The Prometheus series a reader can check, or null when unmeasured. */
  measurementSource: string | null;
  measuredAt: number | null;
}

/** A Prometheus sample for one edge. */
export interface LinkSample {
  value: number;
  /** Epoch ms of the sample. */
  timestamp: number;
  series: string;
}

/**
 * Prometheus series backing each edge. Every series here is already scraped, so
 * this binding adds no new exporters.
 *
 * An edge absent from this map is `declared`: it exists in the architecture but
 * nothing measures it, and it must never render a number.
 */
export const EDGE_METRIC_BINDINGS: Readonly<Record<string, string>> = {
  "data-generator->pulsar-us": "generator_bytes_produced_total",
  "data-generator->pulsar-eu": "generator_bytes_produced_total",
  "data-generator->pulsar-apac": "generator_bytes_produced_total",
  "pulsar-us->collector-us": "collector_messages_forwarded_total",
  "pulsar-eu->collector-eu": "collector_messages_forwarded_total",
  "pulsar-apac->collector-apac": "collector_messages_forwarded_total",
  "collector-us->kafka": "collector_messages_forwarded_total",
  "collector-eu->kafka": "collector_messages_forwarded_total",
  "collector-apac->kafka": "collector_messages_forwarded_total",
  "kafka->java-ingest": "java_ingest_received_total",
  "java-ingest->backend": "java_ingest_forwarded_total",
  "backend->frontend": "frontend_ingest_events_received_total",
};

/** A measurement older than this is reported as stale rather than current. */
export const DEFAULT_FRESHNESS_WINDOW_MS = 60_000;

const CONFIDENCE_BY_STATE: Record<LinkEvidenceState, number | null> = {
  measured: 95,
  derived: 70,
  stale: 45,
  declared: null,
  mock: null,
};

export function edgeKey(source: string, target: string): string {
  return `${source}->${target}`;
}

export function hasMetricBinding(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(EDGE_METRIC_BINDINGS, key);
}

function evidence(
  state: LinkEvidenceState,
  throughputMBps: number | null,
  measurementSource: string | null,
  measuredAt: number | null
): LinkEvidence {
  return {
    throughputMBps,
    state,
    confidencePct: CONFIDENCE_BY_STATE[state],
    measurementSource,
    measuredAt,
  };
}

/**
 * Resolve one edge's evidence.
 *
 * @param sample the Prometheus sample for this edge, or null when the query
 *   returned nothing. A missing sample is `declared`, not zero.
 */
export function resolveLinkEvidence(
  key: string,
  sample: LinkSample | null,
  options: {
    now?: number;
    freshnessWindowMs?: number;
    mockMode?: boolean;
  } = {}
): LinkEvidence {
  const {
    now = Date.now(),
    freshnessWindowMs = DEFAULT_FRESHNESS_WINDOW_MS,
    mockMode = false,
  } = options;

  // Mock mode is labeled mock regardless of what it produced, so demo data can
  // never be mistaken for a measurement.
  if (mockMode) {
    return evidence("mock", null, null, null);
  }

  if (!hasMetricBinding(key) || !sample) {
    return evidence("declared", null, null, null);
  }

  const ageMs = now - sample.timestamp;
  if (ageMs > freshnessWindowMs) {
    // A real measurement exists but is old. Keep the value and degrade the
    // state rather than presenting it at full confidence.
    return evidence("stale", sample.value, sample.series, sample.timestamp);
  }

  return evidence("measured", sample.value, sample.series, sample.timestamp);
}

/** Human-readable label. Absence renders as absence, never as a percentage. */
export function confidenceLabel(state: LinkEvidenceState): string {
  switch (state) {
    case "measured":
      return "Measured";
    case "derived":
      return "Derived from an adjacent measurement";
    case "stale":
      return "Stale measurement";
    case "mock":
      return "Mock data";
    case "declared":
    default:
      return "No measurement";
  }
}

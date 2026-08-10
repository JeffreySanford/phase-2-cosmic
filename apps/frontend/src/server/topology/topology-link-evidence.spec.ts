import {
  DEFAULT_FRESHNESS_WINDOW_MS,
  EDGE_METRIC_BINDINGS,
  EDGE_QUERIES,
  confidenceLabel,
  edgeKey,
  hasMetricBinding,
  resolveLinkEvidence,
  type LinkSample,
} from "./topology-link-evidence";

const NOW = 1_800_000_000_000;

function sample(overrides: Partial<LinkSample> = {}): LinkSample {
  return {
    value: 42,
    timestamp: NOW,
    series: "collector_messages_forwarded_total",
    ...overrides,
  };
}

describe("topology link evidence", () => {
  describe("unmeasured links", () => {
    it("never reports a confidence percentage for an edge with no binding", () => {
      const evidence = resolveLinkEvidence("frontend->nginx", null, {
        now: NOW,
      });

      expect(evidence.state).toBe("declared");
      expect(evidence.confidencePct).toBeNull();
    });

    it("reports null throughput rather than 0 when nothing measured it", () => {
      const evidence = resolveLinkEvidence("frontend->nginx", null, {
        now: NOW,
      });

      // 0 would read as "measured zero traffic", which is a different claim.
      expect(evidence.throughputMBps).toBeNull();
      expect(evidence.throughputMBps).not.toBe(0);
    });

    it("reports declared when a binding exists but the query returned nothing", () => {
      const evidence = resolveLinkEvidence("collector-us->kafka", null, {
        now: NOW,
      });

      expect(evidence.state).toBe("declared");
      expect(evidence.throughputMBps).toBeNull();
      expect(evidence.measurementSource).toBeNull();
    });

    it("labels absence as absence rather than a confidence grade", () => {
      expect(confidenceLabel("declared")).toBe("No measurement");
    });
  });

  describe("measured links", () => {
    it("reports the value and the series it came from", () => {
      const evidence = resolveLinkEvidence(
        "collector-us->kafka",
        sample({ value: 128 }),
        { now: NOW }
      );

      expect(evidence.state).toBe("measured");
      expect(evidence.throughputMBps).toBe(128);
      expect(evidence.measurementSource).toBe(
        "collector_messages_forwarded_total"
      );
      expect(evidence.measuredAt).toBe(NOW);
      expect(evidence.confidencePct).toBeGreaterThanOrEqual(90);
    });
  });

  describe("stale links", () => {
    it("degrades state instead of holding the last value at full confidence", () => {
      const evidence = resolveLinkEvidence(
        "collector-us->kafka",
        sample({ timestamp: NOW - DEFAULT_FRESHNESS_WINDOW_MS - 1 }),
        { now: NOW }
      );

      expect(evidence.state).toBe("stale");
      // The value is retained, but it must not read as current.
      expect(evidence.throughputMBps).toBe(42);
      expect(evidence.confidencePct).toBeLessThan(90);
    });

    it("keeps a sample inside the freshness window measured", () => {
      const evidence = resolveLinkEvidence(
        "collector-us->kafka",
        sample({ timestamp: NOW - DEFAULT_FRESHNESS_WINDOW_MS + 1 }),
        { now: NOW }
      );

      expect(evidence.state).toBe("measured");
    });
  });

  describe("mock mode", () => {
    it("is labeled mock and never reports measured", () => {
      const evidence = resolveLinkEvidence("collector-us->kafka", sample(), {
        now: NOW,
        mockMode: true,
      });

      expect(evidence.state).toBe("mock");
      expect(evidence.state).not.toBe("measured");
      expect(evidence.confidencePct).toBeNull();
      expect(evidence.throughputMBps).toBeNull();
    });
  });

  describe("bindings", () => {
    it("binds every repaired-path edge to a real series", () => {
      for (const key of [
        "data-generator->pulsar-us",
        "pulsar-us->collector-us",
        "collector-us->kafka",
        "kafka->java-ingest",
        "java-ingest->backend",
        "backend->frontend",
      ]) {
        expect(hasMetricBinding(key)).toBe(true);
        expect(EDGE_METRIC_BINDINGS[key]).toBeTruthy();
      }
    });

    it("does not bind the direct pulsar to kafka edge, which does not exist", () => {
      // Nothing bridges Pulsar to Kafka without a collector. A binding here
      // would let the removed edge quietly reappear with a number attached.
      expect(hasMetricBinding("pulsar->kafka")).toBe(false);
    });

    it("builds a stable edge key", () => {
      expect(edgeKey("collector-us", "kafka")).toBe("collector-us->kafka");
    });

    it("gives every bound edge a PromQL query", () => {
      // A binding without a query would resolve to declared forever, which
      // looks like an honest "unmeasured" while actually being a wiring gap.
      for (const key of Object.keys(EDGE_METRIC_BINDINGS)) {
        expect(EDGE_QUERIES[key]).toBeTruthy();
      }
    });

    it("separates per-region edges that share one series by label", () => {
      // All three collectors export collector_messages_forwarded_total, so the
      // query must filter by region or every region would report the same value.
      const us = EDGE_QUERIES["collector-us->kafka"];
      const eu = EDGE_QUERIES["collector-eu->kafka"];

      expect(us).toContain('region="us-west"');
      expect(eu).toContain('region="eu-central"');
      expect(us).not.toBe(eu);
    });
  });
});

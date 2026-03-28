# 9. Observability — Prometheus, Grafana, Tracing

These standards matter because if a service fails and nobody can tell why, then the code is only
technically running. Good metrics, logs, tracing, and dashboards turn outages from guesswork into
diagnosis and make performance and reliability measurable instead of mystical.

## Metrics design

- Follow a documented naming convention by subsystem and unit.
- Prefer histograms for durations; avoid ad-hoc averages.
- Use gauges intentionally; don’t use them for monotonic counts.
- Separate business vs technical metrics by naming and dashboard placement.

## Logging & correlation

- Propagate correlation/trace IDs across HTTP requests and message flows.
- Include service name, environment, version, and correlation IDs in logs.
- Keep logs human-readable and machine-parsable.

## Tracing

- Strongly recommend distributed tracing across HTTP + messaging boundaries.
- Preserve trace propagation through producers/consumers when supported.

## Dashboards & alerts

- Grafana dashboards must show volume, error rate, latency, saturation/queue depth, dependency health.
- Alerts should be actionable; avoid noisy transient triggers.

---

### Checklist

- [ ] Correlation ID propagation implemented in all services
- [ ] Dashboards include the five mandatory panels
- [ ] Alert rules documented and reviewed

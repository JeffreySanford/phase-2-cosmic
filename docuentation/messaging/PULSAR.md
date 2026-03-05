# Pulsar Messaging Plan (Phase 2)

Alignment anchors

- Frontend UX source of truth: [../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../ROADMAP.md](/ROADMAP.md)

## Role in platform

- Pulsar handles remote-site edge ingest buffering and forwarding into the central processing hub.
- Pulsar is not replacing Kafka in current plan; it feeds Kafka ETL topics through a bridge/connector path.

## Local runtime decision (accepted)

- Local normal deployment includes Pulsar full profile by default.
- Baseline distro: Apache Pulsar official images.
- StreamNative distribution remains an evaluation path via explicit benchmark spike.

Related decision records:

- [DECISIONS.md](/docuentation/architecture/DECISIONS.md) (`ADR-003`, `ADR-004`)

## Expected local topology

- Pulsar broker + bookkeeper + zookeeper/proxy (as required by chosen compose profile)
- Pulsar ingest topics for edge-style telemetry
- Pulsar->Kafka bridge path for central ETL integration

## Stress profile behavior

- Footer profile control (`10%`, `25%`, `50%`, `100%`) must affect Pulsar traffic.
- `100%` mode is capped at 3 minutes and auto-reverts to `10%`.
- Scaling dimensions: rate + message size + fanout.

## Required tests

Unit:

- Pulsar bridge config parsing and topic mapping validation
- profile scaling math for rate/size/fanout

Integration:

- Pulsar publish -> Kafka consume flow
- restart/failure replay and DLQ checks

E2E:

- Topology view renders Pulsar node/link/health indicators
- Visualization page renders Pulsar backlog/publish metrics with source-state labels

## Benchmark spike (Apache vs StreamNative)

Run identical scenarios and compare:

- throughput
- backlog growth/recovery
- memory/CPU footprint
- startup and operational complexity

Output artifact:

- recommendation memo with go/no-go and migration impact.

# Go Data Generator Specification

Status: Prototype (Phase 2)

## Overview

This document specifies the `tools/data-generator` prototype implemented in Go (recommended). The generator simulates raw ingest traffic for the Operational Streaming Plane and provides modes to approximate production rates (7.5–8 GB/s) and low-rate functional tests (1 Mb/s).

Recent flags added (implementation notes)
--------------------------------------------------
- `--sink=file:<path>`: write raw payloads to the given file path instead of stdout. Useful for local capture and testing without spewing binary to logs.
- `--audit-every=<N>`: write a human-readable audit line every N records to `payloads.log` when using `--sink=file:`. Set high (e.g. 1000) or 0 to reduce verbosity.
- `--rotate-size-mb=<N>`: rotate `payloads.bin` and `payloads.log` when the sink file exceeds N MiB (default 50). Rotated files are renamed with UTC timestamp suffix.

Scaling & deployment notes
--------------------------------------------------
Local scaling:
- The generator is single-process by default and accepts `--rate` and `--payload-size`. For higher throughput on a single host, run multiple instances and partition the target rate across them. Use `--sink=file:logs/payloads.<id>.bin` per instance to avoid contention.
- Recommended local worker count: number of logical cores minus one to leave a core free for OS tasks. Use `--audit-every` to reduce logging overhead when running many workers.

Production scaling:
- For production-level throughput (7.5–8 GB/s ≈ 60–64 Gbit/s) use either:
  - Dedicated high-performance hosts with 100GbE and NVMe (single-host approach), or
  - A distributed cluster: many smaller hosts each running multiple generator instances (recommended for cost and reliability).
- Container orchestration: run the generator in Kubernetes. Expose Prometheus metrics (`generator_bytes_produced_total`) and use a Horizontal Pod Autoscaler (HPA) driven by a Prometheus metric adapter to scale replicas to meet a target aggregate throughput.
- When targeting Kafka or other messaging backends, run multiple producers and partition keys to achieve parallelism.

Examples
--------------------------------------------------
Low-rate smoke test:
```
./data-generator --payload-size=512 --rate=125000 --duration=300s
```

High-rate (per-worker) example for distributed tests:
```
./data-generator --payload-size=4096 --rate=937500000 --duration=30s --metrics-addr=:9090
```

Refer to `tools/data-generator/README.md` for local launcher scripts and Kubernetes manifests.

## Goals & Rationale

- Provide a reproducible, configurable producer that can send payloads to `kafka://`, `http://`, files, or stdout.

- Use Go for low GC overhead and efficient concurrency to approximate high-throughput producers on commodity hardware.

- Emit Prometheus metrics for integration with observability and performance capture.

## Requirements

- Language/runtime: Go 1.21

- CLI: single binary with flags and human-friendly rate suffixes

- Rate limiting: token-bucket with per-producer and global cap

- Outputs: Kafka (sarama or segmentio/kafka-go), HTTP POST, file sink, stdout

- Modes: `burst`, `steady`, `sampled` (see Modes)

- Metrics: Prometheus endpoint (`/metrics`) exposing bytes_produced_total, records_produced_total, produce_errors_total, produce_latency_seconds_bucket

- Config: JSON/YAML config for complex runs; CLI for quick experiments

## CLI & Flags (recommended)

- `--target` (string): `kafka://host:9092/topic` | `http://host/ingest` | `file:///path` | `stdout`

- `--rate` (string): bytes/sec or human suffix (`7.5GB/s`, `125kb/s`, `1mbit`)

- `--parallel` (int): number of concurrent producers

- `--payload-size` (int): bytes per message

- `--duration` (string): `30s`, `5m`, `1h`

- `--mode` (string): `steady|burst|sampled`

- `--metrics-addr` (string): `:9090` (Prometheus scrape endpoint)

- `--payload-template` (string): path to JSON/FITS-like blob template

## Modes and Behavior

- Steady: sustain the provided `--rate` using token-bucket pacing.

- Burst: produce at max throughput for short windows (e.g., 1s) with configurable idle to approximate average rate.

- Sampled: produce smaller records but include a `weight` header to simulate larger logical payloads downstream.

## Metrics & Observability

- Expose Prometheus metrics:

  - `generator_bytes_produced_total`

  - `generator_records_produced_total`

  - `generator_produce_errors_total`

  - `generator_produce_latency_seconds_bucket`

- Add structured logs (JSON) with sample rate and per-producer stats.

- Provide a `/metrics` readiness endpoint and `/health` probe.

## Integration Points

- Kafka: topic partitioning strategy recommended to match `--parallel` producers.

- Governance API: provide an HTTP adapter mode that POSTs event metadata to `openapi/governance.yaml` endpoints for contract validation.

- Dev Compose: include `tools/data-generator` as a service in `docker/dev-compose.yml` for quick smoke tests.

## Data Schema & Fixtures

- Provide `schemas/fixtures/generator/` with example payloads: small header-only event, FITS-like blob, and weighted-sample event.

- Generator should optionally sign or annotate events with `producer_id`, `sequence`, and `timestamp` for downstream tracing.

## Why Go? (detailed reasoning)

- Low and predictable GC overhead — important for long-running high-throughput producers.

- Excellent concurrency primitives and a small static binary for easy dockerization and distribution.

- Rich ecosystem for Kafka clients and Prometheus instrumentation.

## Mermaid: High-level flow

```mermaid

```

mermaid
flowchart LR
  A[Generator (Go)] --> B[Kafka Topic]
  B --> C[Go Streaming Processors]
  C --> D[Java Governance API]
  D --> E[Storage (Data Lake)]
  A --> D
  subgraph Metrics
    M[Prometheus]
    M --> A
    M --> C
    M --> D
  end
  %% Legend
  subgraph Legend[Legend]
    L_gen[Generator]
    L_broker[Broker]
    L_processing[Processing]
    L_storage[Storage]
    L_metrics[Metrics]
  end

  style L_gen fill:#1f78b4,stroke:#0b3a66
  style L_broker fill:#33a02c,stroke:#1b5e20
  style L_processing fill:#33a02c,stroke:#1b5e20
  style L_storage fill:#ff7f00,stroke:#b35400
  style L_metrics fill:#ffcc00,stroke:#b88600

```

## Runbook snippets

Example steady run (8 producers):

```

bash
./data-generator --target kafka://localhost:9092/topic-ingest --parallel 8 --payload-size 4096 --rate 937500000 --duration 30s --metrics-addr :9090

```

Low-rate smoke (1 Mb/s):

```

bash
./data-generator --target kafka://localhost:9092/topic-ingest --payload-size 512 --rate 125000 --duration 300s

```

## CI / Tests

- Unit tests: validate token-bucket, adapter behavior, rate calculations

- Integration: lightweight CI job that starts Kafka and runs a short generator (1 Mb/s) and validates metrics and delivery

## Next work

- Implement producer adapters, Prometheus metrics, and the `burst` mode. Add example configs and CI smoke test.

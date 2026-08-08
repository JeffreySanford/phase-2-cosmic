# Pipeline Telemetry Evidence

## Purpose

The `/telemetry` route is the operator-facing evidence view for the current streaming path and the staged Lakehouse Initiative in PR #40.

The view is intentionally evidence-first: it distinguishes measured runtime behavior from configured intent, public-science source proof, unavailable measurements, explicit mock/test data, and Lakehouse stages that are not implemented yet.

## Current runtime path

```text
Data Generator -> Kafka -> Java Ingest -> Java Governance -> Lakehouse boundary
```

The current runtime path is measurable through Prometheus and authoritative admin APIs. Bronze Delta, Silver, and Gold remain explicitly `Not implemented` until Stage 3 creates real runnable evidence.

## Evidence labels

| Label | Meaning |
| --- | --- |
| `Measured · Prometheus` | Value comes from a Prometheus query over a configured scrape target. |
| `Measured · Admin API` | Value comes from an authoritative service/admin API. |
| `Live source` | Live public-source evidence such as the current VO/TAP proof. |
| `Fallback evidence` | A real proof/fallback source exists but is not the primary operational measurement. |
| `Unavailable` | No trustworthy measurement is currently available. |
| `Mock · test/demo only` | Synthetic values are allowed only in explicit test/demo mode and must never replace unavailable live telemetry. |

## Lakehouse evidence API

Active frontend consumers use the versioned endpoint:

```text
GET /api/v1/lakehouse/metrics
```

This route is handled on the stable `/api/v1/*` server path rather than depending on implicit constructor metadata in the large SSR controller. It returns public-source proof and persistence freshness without promoting that proof into implemented medallion stages.

The ESO proof summary deliberately reports Bronze, Silver, and Gold completion percentages as `0` until Stage 3 produces runnable Delta evidence. If persistence is unavailable, a successful live ESO fetch can still be returned. If the live source is unavailable, only previously persisted proof that already follows this proof-only contract may be marked stale and reused; otherwise the endpoint returns an explicit fallback/unavailable summary.

## Generator intent vs measured output

The container defines explicit generator intent:

- target throughput: `125000 B/s`
- target payload size: `512 B`
- segment weights: `main:48,lbl:24,sba:21`

The generator exports:

- `generator_target_bytes_per_second`
- `generator_target_payload_bytes`
- `generator_bytes_produced_total`
- `generator_records_produced_total`
- `generator_bytes_produced_by_segment_total{array_segment=...}`
- `generator_records_produced_by_segment_total{array_segment=...}`

The target metrics come from the same environment-backed values used by the Docker runtime flags. This prevents the UI from treating a configured workload target as if it were a measured result.

## Prometheus sample cadence

Prometheus currently scrapes every 15 seconds. The Pipeline Telemetry raw-sample view queries generator throughput with a 15-second evaluation step to match that scrape cadence.

The previous UI evaluated a five-minute query at approximately two-second intervals. That produced repeated values between real scrapes and made the sample list look more granular than the underlying measurements. The new view does not present those repeated evaluation timestamps as independent physical samples.

## Tabs

### Overview

Answers: **Is the measured pipeline doing what we asked it to do?**

Shows configured target, actual generator throughput, target attainment, records/sec, Kafka lag, Java-ingest processing rate, evidence source, cache freshness, and the measured generator-to-governance path.

### Throughput

Compares measured generator throughput with configured target intent. A sustained gap remains visible as evidence for investigation rather than being normalized as success.

### Segments

Compares the configured `48:24:21` distribution against Prometheus-observed per-segment throughput.

### Pipeline

Correlates existing measurements across Generator, Kafka, Java Ingest, and Governance. The Lakehouse boundary is shown directly after Governance.

Bronze Delta, Silver, and Gold remain `Not implemented` until runnable Delta evidence exists.

### Science Source

Separates public astronomy source evidence from operational telemetry. The current VO/TAP profile proves the source boundary but does not imply that Bronze/Silver/Gold tables exist.

### Alert SLO

Keeps alert latency, DLQ depth, replay count, and DLQ replay actions visible as resilience evidence.

### Raw Samples

Provides engineering-level Prometheus samples and explicitly shows the metric expression, scrape interval, query evaluation step, and sample count.

## Lakehouse claim boundary

The telemetry UI must not promote proof vocabulary into implementation claims.

Until Stage 3 is runnable, the view must continue to state:

```text
Bronze Delta  NOT IMPLEMENTED
Silver        NOT IMPLEMENTED
Gold          NOT IMPLEMENTED
```

The first complete Lakehouse claim still requires:

```text
real public astronomy source
  -> Kafka
  -> Spark
  -> Bronze Delta
  -> Silver canonical entity / analytical quarantine
  -> Gold aggregate
```

with replay, deduplication, schema evolution, quarantine, lineage, freshness, and measured execution behavior.

## Next instrumentation

The current view is useful with existing metrics, but later generator instrumentation should add explicit delivery evidence:

- attempted records/messages
- Kafka write successes and failures
- Kafka write latency
- actual Kafka payload bytes

Stage 3 should then add Lakehouse-native evidence such as Bronze input/commit rates, Silver accepted/rejected/duplicate/quarantine rates, Gold freshness/materialization metrics, checkpoint age, event-time lag, processing-time lag, replay counts, and schema-version evidence.

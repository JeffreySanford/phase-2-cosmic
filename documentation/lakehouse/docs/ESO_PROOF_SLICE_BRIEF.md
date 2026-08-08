# VO/TAP proof slice — ESO first provider profile

> File name retained for continuity with the current PR #40 work.
> Current provider profile: **ESO TAP / ObsCore**.
> Architectural goal: prove the reusable Lakehouse path without making ESO the canonical data model.

## Purpose

This brief describes the first real-public-data proof inside PR #40 and separates what is **already implemented as an evidence scaffold** from what still constitutes the **first complete Lakehouse vertical slice**.

## Current working source

- Provider: ESO
- Source: TAP / ObsCore
- Endpoint: `https://archive.eso.org/tap_obs`
- Why it was useful first: public, bounded observation metadata can be queried without downloading large science products.

ESO is an implementation profile. The ingestion contract is intended to support NRAO/VLA/VLASS and other provider profiles without changing the canonical Bronze/Silver/Gold model.

## What PR #40 already proves

The branch now contains a runnable precursor path:

```text
ESO ObsCore
    |
    v
live bounded metadata fetch
    |
    v
Lakehouse metrics/evidence service
    |
    v
Postgres or in-memory proof state
    |
    v
operator evidence panel
```

This proves public-source connectivity and integration with the existing UI/evidence surface. It does **not** yet prove a Delta Lakehouse, because Kafka -> Spark -> Bronze/Silver/Gold table persistence has not been demonstrated by this path.

## First complete Lakehouse slice

The first full slice should prove:

```text
ESO or NRAO provider profile
          |
          v
provider-neutral source contract
          |
          v
Kafka
          |
          v
Spark / Delta Bronze
          |
          v
Silver canonical observation
          |
          v
Gold aggregate
          |
          v
measured evidence / UI
```

### In scope

- Use a modest real public astronomy metadata extract/profile.
- Preserve provider/source attribution and source-faithful payload in Bronze.
- Route the source through the Kafka-first baseline.
- Persist a real Bronze representation.
- Create one canonical observation entity in Silver.
- Retain one malformed/incomplete record in Bronze and route the failed canonicalization to Silver analytical quarantine with a reason code.
- Demonstrate duplicate handling and one schema-evolution case.
- Produce one persisted Gold aggregate such as counts by collection/product type/source or an observation summary.
- Retain Gold -> Silver -> Bronze -> provider/source traceability.
- Feed at least one real Gold-backed value into the evidence surface.

### Out of scope for the first complete slice

- Large science-product downloads as a prerequisite for proving the pipeline.
- Replacing MinIO/S3 with Delta storage.
- Treating RAW/CAL/SCI/DRV as Bronze/Silver/Gold synonyms.
- Full ngVLA-scale ingestion claims.
- Production-grade multi-provider catalog federation.
- Pulsar comparison before the Kafka baseline is stable.
- Production AI/RAG workflows.

## Provider-neutral ingest shape

The provider mapping should normalize into existing Phase 2 event/source-attribution semantics. At minimum the ingest path should preserve:

- stable event/source identifier,
- event type,
- schema version,
- source/provider identity,
- source attribution and access/citation reference,
- source-faithful payload,
- ingest timestamp,
- adapter version,
- idempotency/replay key,
- object/access URI where available,
- checksum where available,
- source/parse quality flags.

ESO-specific fields such as `obs_publisher_did`, `obs_collection`, `dataproduct_type`, `s_ra`, `s_dec`, and `access_url` belong to the ESO provider mapping/source payload. Silver should normalize them into canonical Cosmic concepts where an explicit mapping exists.

## Expected layer behavior

### Bronze

Preserve source truth and replay context. Bronze should tolerate incomplete provider rows when the payload can be safely retained; failure to satisfy a Silver contract should not erase the original record.

### Silver

Normalize the Bronze record into one canonical observation/entity. Handle duplicates, schema versions, source attribution, timestamps, and analytical quality. Route records that cannot satisfy the canonical contract into **Silver analytical quarantine** with deterministic reasons.

### Gold

Create a consumer-oriented aggregate/view with explicit lineage to its Silver and Bronze sources.

## Failure-domain rules

- **Broker DLQ:** transport/consumer processing failure.
- **Science-object quarantine:** persisted object checksum/integrity/science-quality failure.
- **Silver quarantine:** successfully retained source record that cannot satisfy the analytical canonical contract.

These paths must remain separate in both evidence and documentation.

## Done criteria

The first complete slice is done when:

- a real public provider profile is reproducibly ingested through Kafka,
- persisted Bronze source records exist,
- one Silver canonical entity and one Silver-quarantined record exist,
- one persisted Gold aggregate exists,
- duplicate/schema-evolution behavior is demonstrated,
- traceability to source attribution is preserved,
- measured evidence and limitations are captured in the repository.

## Evidence artifacts

Capture:

- the provider query/extract/replay definition,
- sample canonical ingest envelope,
- sample Bronze records,
- one promoted Silver record,
- one Silver quarantine record and reason,
- one Gold query/result,
- end-to-end lineage note,
- measured execution notes with environment and dataset size.

The existing live ESO dashboard path remains useful as the evidence surface that these later real Lakehouse results can feed.

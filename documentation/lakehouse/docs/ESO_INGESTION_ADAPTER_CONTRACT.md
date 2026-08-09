# VO/TAP ingestion contract — ESO implementation profile

> File name retained for continuity with the existing PR #40 implementation.
> Architectural scope: **provider-neutral source-to-Bronze contract**.
> Current provider profile: **ESO TAP / ObsCore**.

## Purpose

This document defines how a public astronomy archive/provider is adapted into the Lakehouse without making provider-specific fields part of the canonical Cosmic domain model.

ESO ObsCore is the first working profile because PR #40 already contains a live bounded ESO metadata fetch. The same contract should support NRAO/VLA/VLASS and other VO/TAP-compatible sources through provider-specific mappings.

## Current ESO profile

- Provider: ESO
- Source system: TAP / ObsCore
- Endpoint: `https://archive.eso.org/tap_obs`
- Delivery mode: bounded metadata query over TAP/ADQL
- Current PR #40 evidence path: live provider fetch -> Lakehouse metrics/evidence service -> operator panel
- Full Lakehouse target: provider profile -> canonical ingest envelope -> Kafka -> Bronze Delta

The existing live evidence path is a precursor to the full adapter; it must not be described as a persisted Bronze table until that table exists.

## Adapter responsibilities

A provider adapter should:

1. Query/read a bounded source dataset using the provider's supported interface.
2. Preserve the original/source-faithful row or payload.
3. Map provider identity into existing Phase 2 source-attribution vocabulary.
4. Map stable provider identifiers into existing event/observation/dataset identifiers where safe and explicit.
5. Attach ingest and adapter metadata needed for replay and reproducibility.
6. Emit a provider-neutral canonical ingest envelope suitable for Kafka/Bronze ingestion.
7. Preserve provider-specific fields inside the source payload/profile mapping rather than promoting them into unrelated canonical domain fields.

## Canonical ingest envelope

The Lakehouse contract should reuse the semantics already present in Phase 2 event, manifest, and provenance models.

| Field                | Required    | Purpose                                                                                    |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `event_id`           | yes         | Stable event identifier assigned by the producer/adapter.                                  |
| `event_type`         | yes         | Canonical event type such as `observation.metadata.ingested`.                              |
| `timestamp`          | yes         | Event/source timestamp when available; otherwise explicitly documented adapter event time. |
| `correlation_id`     | recommended | Groups related ingest/replay activity.                                                     |
| `schema_version`     | yes         | Canonical envelope/schema version.                                                         |
| `source`             | yes         | Source/provider identity used by the canonical event envelope.                             |
| `payload`            | yes         | Source-faithful provider row/payload or lossless normalized representation.                |
| `idempotency_key`    | recommended | Stable key supporting replay/deduplication.                                                |
| `source_attribution` | yes         | Existing Phase 2 provider/source/access/citation metadata.                                 |
| `adapter_version`    | yes         | Version of the provider mapping implementation.                                            |
| `ingest_time`        | yes         | UTC receipt/adapter timestamp.                                                             |
| `object_uri`         | no          | Authoritative object/access reference when present.                                        |
| `checksum`           | no          | Provider/object checksum when available.                                                   |
| `quality_flags`      | no          | Source/parse observations that do not require losing the Bronze record.                    |

### Source attribution

Use the existing Phase 2 source-attribution semantics rather than creating a second source model. A provider mapping should preserve fields equivalent to:

```json
{
  "sourceType": "metadata",
  "sourceName": "ESO ObsCore",
  "providerName": "ESO",
  "sourceState": "live",
  "citationUrl": "https://archive.eso.org/tap_obs",
  "accessUrl": "https://archive.eso.org/tap_obs",
  "datasetId": "provider record or dataset identifier",
  "accessedAt": "2026-08-07T00:00:00Z"
}
```

For NRAO/VLA/VLASS the same structure should be populated with NRAO-specific values; downstream Silver contracts should not have to change merely because the provider changes.

## ESO field mapping profile

Provider-specific fields remain a mapping concern:

| ESO ObsCore field   | Canonical use                                                 |
| ------------------- | ------------------------------------------------------------- |
| `obs_publisher_did` | stable source record/dataset identifier and idempotency input |
| `obs_collection`    | source payload; candidate canonical collection metadata       |
| `dataproduct_type`  | source payload; candidate canonical product-type metadata     |
| `s_ra`, `s_dec`     | source payload; candidate canonical pointing metadata         |
| `access_url`        | source access/object reference                                |

Example canonicalized ingest record:

```json
{
  "event_id": "eso:obs:001:v1",
  "event_type": "observation.metadata.ingested",
  "timestamp": "2026-08-07T00:00:00Z",
  "correlation_id": "tap-replay-001",
  "schema_version": "1.0",
  "source": "eso-obscore",
  "idempotency_key": "eso:obs:001",
  "adapter_version": "0.1.0",
  "ingest_time": "2026-08-07T00:00:00Z",
  "source_attribution": {
    "sourceType": "metadata",
    "sourceName": "ESO ObsCore",
    "providerName": "ESO",
    "sourceState": "live",
    "citationUrl": "https://archive.eso.org/tap_obs",
    "accessUrl": "https://archive.eso.org/tap_obs",
    "datasetId": "eso:obs:001",
    "accessedAt": "2026-08-07T00:00:00Z"
  },
  "object_uri": "https://example.org/provider/object/001",
  "quality_flags": [],
  "payload": {
    "obs_publisher_did": "eso:obs:001",
    "obs_collection": "example-collection",
    "dataproduct_type": "image",
    "s_ra": 123.456,
    "s_dec": -45.678,
    "access_url": "https://example.org/provider/object/001"
  }
}
```

## Bronze retention rules

Bronze is the source-fidelity boundary, not the canonical-acceptance boundary.

- If the provider row/payload can be retained safely, preserve it in Bronze even when canonical fields are incomplete.
- Attach parse/source-quality state rather than silently dropping a row because it cannot satisfy Silver.
- Records that cannot satisfy the Silver canonical contract belong in **Silver analytical quarantine** after Bronze retention.
- Broker delivery/consumer failures belong in the broker DLQ path, not Silver quarantine.
- Science-object checksum/integrity failures belong in the object-quarantine path, not Silver quarantine.

## Silver mapping target

Silver should normalize provider-specific metadata into existing Cosmic concepts such as:

- canonical Observation,
- Dataset Manifest/source attribution,
- provenance/lineage references,
- quality records.

ESO `obs_collection` or NRAO-specific project fields should not become globally canonical merely because one provider emits them. The Silver schema should describe the Cosmic concept and retain provider-specific details separately when needed.

## Evidence expectations

The full adapter implementation should eventually produce:

- a bounded real provider input/replay definition,
- sample canonical ingest envelopes,
- persisted Bronze records,
- one Bronze record carrying a source-quality flag without being silently lost,
- one Silver-promoted record,
- one Silver-quarantined record with reason code,
- lineage back to source attribution/query context.

The current PR #40 ESO live fetch and evidence panel satisfy the **provider connectivity/evidence scaffold** portion only; they do not by themselves satisfy the persisted Bronze/Silver/Gold criteria.

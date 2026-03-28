# Persistence Plan

Alignment anchors

- Runtime architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- GraphQL contract: [./GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md)
- PI tracker: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)

Status: `in_progress`

## Purpose

This document defines the first durable persistence model for Cosmic Forge so the queue, results, and provenance can move beyond in-memory state.

## Immediate goal

The first persistence slice should support:

- bootstrap reads for surveys, jobs, and image products
- durable queue lifecycle transitions
- retry and cancel auditability
- cached artifact lookup and provenance retention

## Current implementation state

The Forge branch no longer relies on process-memory-only queue reads.

Current posture:

- the API uses a repository-backed persisted state file for jobs, image products, and queue events
- the GraphQL contract remains stable while the backing store is abstracted behind the store/repository seam
- this is a transitional durability layer for Sprint 3, not the final persistence posture

That means the branch now has restart-survivable local state, while still preserving a clean upgrade path to PostgreSQL.

## First implementation posture

- keep the runtime contract stable
- move state from in-memory Nest services into a small relational model
- use one write path owned by the Forge API and worker
- treat artifact payloads as file/object storage, not large database blobs

## Recommended next backing store

- `PostgreSQL`

Rationale:

- already present in the local Forge Docker stack
- good fit for queue rows, provenance records, and relational joins
- keeps the first durable slice simple without introducing broker complexity
- replaces the Sprint 3 file-backed repository with a stronger multi-process store

## Minimal durable entities

### `forge_jobs`

- `id`
- `type`
- `status`
- `requested_by`
- `target_name`
- `ra`
- `dec`
- `radius_arcmin`
- `requested_survey_ids` as array or join table
- `progress_percent`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`
- `started_at`
- `completed_at`
- `cancelled_at`

### `forge_job_requests`

- `job_id`
- `provider_adapter`
- `source_service`
- `mission_family`
- `collection`
- `layer`
- `bands`
- `ra`
- `dec`
- `radius_arcmin`
- `pixscale`
- `size`
- `width`
- `height`
- `output_format`
- `retrieval_path_type`
- `discovery_url`
- `jpeg_cutout_url`
- `fits_cutout_url`
- `created_at`

### `forge_image_products`

- `id`
- `job_id`
- `survey_id`
- `provider_name`
- `artifact_mode`
- `format`
- `preview_url`
- `fits_url`
- `authoritative_url`
- `accessed_at`
- `cache_key`
- `cache_status`
- `created_at`

### `forge_image_provenance`

- `image_id`
- `source_survey`
- `provider_name`
- `citation_url`
- `authoritative_url`
- `accessed_at`
- `artifact_mode`
- `transform_chain`
- `mission_family`
- `collection`
- `retrieval_path_type`
- `output_format`
- `citation_reference`
- `dataset_doi`
- `layer`
- `band_set`
- `ra`
- `dec`
- `pixscale`
- `size`
- `width`
- `height`

### `forge_job_events`

- `id`
- `job_id`
- `event_type`
- `from_status`
- `to_status`
- `message`
- `error_code`
- `created_at`

This table is the audit trail for queue progression, retry, cancel, and upstream failure history.

## Contract mapping

The first durable read model should map directly to the current GraphQL shapes:

- `jobs`
- `imageProducts`
- `createCutoutJob`
- `cancelJob`
- `retryJob`
- `cacheImageArtifact`

The contract should not change just because persistence is introduced.

## Error posture

The durable model should classify at least:

- `VALIDATION_ERROR`
- `UNSUPPORTED_SURVEY`
- `UPSTREAM_UNAVAILABLE`
- `UPSTREAM_BAD_RESPONSE`
- `ARTIFACT_CACHE_FAILURE`
- `INTERNAL_ERROR`

These should be stored on the job row and appended to `forge_job_events`.

## Worker ownership

The worker should:

- claim queued jobs transactionally
- update progress and status through the same persistence boundary
- write result images and provenance only after a successful retrieval/render step
- append job events for each status transition

## Artifact storage boundary

- keep preview PNG/JPEG and FITS payloads on disk or object storage
- store only lookup metadata in PostgreSQL
- preserve the current Forge artifact routes as the stable access surface

## Suggested implementation order

- keep the current repository interfaces under the Forge API
- preserve the file-backed implementation as the local fallback and contract test baseline
- add PostgreSQL-backed implementations
- switch the worker and GraphQL services to repository-backed reads and writes
- add migration files for the durable schema

Current local implementation note:

- Sprint 4 now uses the file-backed repository as the authoritative queue-state seam for worker claim/execute/cancel/retry flows
- worker execution no longer relies on placeholder progress timers to move jobs through the queue
- add integration tests for create, run, fail, retry, cancel, and artifact retention

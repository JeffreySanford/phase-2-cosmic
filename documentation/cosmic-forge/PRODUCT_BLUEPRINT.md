# Product Blueprint

Alignment anchors

- Existing viewer groundwork: [../viewer/VIEWER_MODEB.md](../viewer/VIEWER_MODEB.md)
- Public-source inventory: [../public-data/PUBLIC_DATA_RESOURCES.md](../public-data/PUBLIC_DATA_RESOURCES.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `planned`

## Product definition

## Cosmic Forge: Public Survey Image Orchestrator

A queue-driven application for requesting, processing, visualizing, and tracking astronomical image cutouts and composites from public survey products.

## Core v1 capability

- target name or RA/Dec input
- survey selection
- cutout/composite job submission
- queued/running/completed/failed lifecycle
- preview assets plus FITS/download metadata
- provenance capture
- live progress updates
- operator-facing queue and diagnostics

## Primary users

### Scientist or analyst

- request image products for a target or coordinate region
- compare survey outputs
- download resulting artifacts and inspect metadata

### Operator or developer

- monitor queue health and failure modes
- retry or cancel work
- inspect provider and processing status

## User stories

- As a user, I can enter a target name or coordinates and submit a public cutout job.
- As a user, I can select one or more surveys and receive preview imagery plus FITS-linked outputs.
- As a user, I can request a composite from aligned public image inputs.
- As a user, I can see provenance, source attribution, and transform history for a result.
- As an operator, I can monitor queued, running, failed, and completed image jobs.
- As an operator, I can retry failed work or cancel in-flight work.

## MVP scope

### Included

- one Angular UI for workbench, queue, and results
- one Forge API for GraphQL orchestration
- one worker process or hosted background worker model
- one or two public survey adapters first
- artifact/provenance persistence
- basic observability hooks
- side-by-side Docker environment for local development

### Explicit non-goals

- full calibration of raw VLASS/VLA visibilities
- science-grade deconvolution pipeline replacement
- in-browser reconstruction from raw interferometric data
- repo-wide replacement of the current governance/control-plane implementation

## Subsystem boundaries

### UI

- target entry
- survey selection
- job queue
- image gallery
- viewer/layer controls
- provenance detail

### API

- GraphQL query/mutation/subscription surface
- target resolution and job creation
- metadata read model
- orchestration entry point

### Worker

- survey adapter calls
- cutout/product retrieval
- preview generation
- composite orchestration
- result and provenance persistence

### Storage

- metadata persistence
- artifact storage
- cache-friendly layout for previews and FITS-linked outputs

## Milestones

1. Vertical slice with mock adapter and real queue state
2. First real public survey adapter
3. Multi-survey comparison and provenance
4. Composite generation
5. Optional native acceleration seam

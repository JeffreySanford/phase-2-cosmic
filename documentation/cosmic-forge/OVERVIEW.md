# Cosmic Forge Overview

Alignment anchors

- Existing viewer groundwork: [../viewer/VIEWER_MODEB.md](../viewer/VIEWER_MODEB.md)
- Public-source inventory: [../public-data/PUBLIC_DATA_RESOURCES.md](../public-data/PUBLIC_DATA_RESOURCES.md)
- Program guardrails: [../overview/PROGRAM_DIRECTION.md](../overview/PROGRAM_DIRECTION.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `implemented`

## What this is

Cosmic Forge is the proposed image-oriented branch of `phase-2-cosmic`: a public-survey image orchestrator that requests cutouts, composites, previews, and provenance-rich image products from public astronomy sources, then exposes those results in a queue-driven operator-facing UI.

The key word is orchestrator.

This is not a plan to rebuild NRAO, VLASS, CASA, or a full interferometric calibration pipeline from scratch. It is a plan to build a real system around public science-ready or viewer-ready products first, using the current repo's existing public-data and viewer work as the foundation.

## Why this is worth building

The repo already contains a control-plane and operations-console narrative, plus concrete work around:

- VLASS and other public-image sources
- Aladin/HiPS viewer integration
- VO/TAP/DataLink thinking
- jobs, provenance, and operator workflows

What it does not yet contain is a focused application branch that turns those ingredients into an image-product workflow with clear job semantics, artifact handling, and modern frontend state orchestration.

Cosmic Forge closes that gap.

It gives the broader Phase 2 story a product that feels concrete:

- request a target or coordinate region
- choose surveys
- submit a cutout or composite job
- stream progress
- inspect previews and FITS metadata
- retain provenance and source attribution

That is a serious portfolio project and a defensible next step for the repo.

## Why this is not just another queue demo

A generic queue app would show technical competence but no domain seriousness. Cosmic Forge is better because it has a real scientific and operational purpose:

- the queue exists to coordinate public survey retrieval and image processing
- provenance is not decorative; it is part of the scientific trust model
- viewer state, layer selection, and source attribution matter to the product
- public-data provider reliability and metadata quality affect system behavior

That means the project can justify:

- NgRx entity/state discipline
- GraphQL subscriptions for progress and results
- bounded-concurrency workers
- a later native compute seam for real image operations

## Why `phase-2-cosmic` is the right incubation home

This repo is already the implementation-oriented half of the broader Cosmic Horizon direction. The current docs make it clear that the repository is a hybrid control-plane prototype with a real frontend, a governance service, public-data research, and a viewer track.

That makes `phase-2-cosmic` the right place to incubate Cosmic Forge as a branch and bounded app family.

It is the wrong move to:

- force this into the current Java/OpenAPI path as if nothing changed
- scatter it into a separate repo before it proves itself
- pretend the whole repo is now Angular + NgRx + GraphQL + NestJS

The disciplined move is:

- keep the existing implementation truth intact
- declare Cosmic Forge as an exploratory bounded track
- build it on a branch
- give it its own Docker environment that can run alongside the current one

## Critical reality check

Some parts of the idea are strong now. Some parts are premature.

Strong now:

- image viewing from public HiPS/survey products
- public cutout retrieval
- preview generation
- provenance and attribution tracking
- multi-survey comparison
- operator queue and diagnostics

Premature as v1:

- full raw visibility ingestion and imaging
- science-grade deconvolution replacement
- claiming parity with observatory archive processing
- making every broker in the current compose stack a dependency of Forge

## Risks and overreach

### Architecture drift

The current repo truth is Angular frontend plus Java/OpenAPI/governance-oriented backend work. Cosmic Forge introduces a bounded alternative stack. That is acceptable only if the docs keep the distinction explicit.

### Stack sprawl

Adding NgRx, GraphQL, NestJS, Go rendering, and optional later C++ can become résumé theater if the interfaces are not tightly scoped. Forge must stay product-led, not tool-led.

### Public-source reliability and CORS

The current viewer work already depends on external sources. Forge will deepen that dependency. Provider outages, CORS behavior, rate limits, and metadata inconsistency are product risks, not edge cases.

### Overpromising science-grade imaging

Public image products are enough for a real system now, but they are not the same thing as raw radio pipeline reconstruction. The docs must keep that line bright.

## Working decision

Cosmic Forge should proceed as:

- a branch of `phase-2-cosmic`
- a bounded new-stack incubator
- a side-by-side Docker environment using the root `.env` for local development
- an implemented bounded-track deliverable with explicit post-PI carryover

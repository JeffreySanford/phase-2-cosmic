# UI Surface Plan

Alignment anchors

- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- State model: [./NGRX_STATE_BLUEPRINT.md](./NGRX_STATE_BLUEPRINT.md)
- SSR routing: [./SSR_PROXY_SPEC.md](./SSR_PROXY_SPEC.md)
- Current frontend reality: [../frontend/FRONTEND_UI.md](../frontend/FRONTEND_UI.md)

Status: `implemented_for_single_route_workbench`

## Purpose

This document defines how Cosmic Forge should appear in the frontend without disturbing the current Cosmic Horizon route structure.

## Route decision

Reserve a branch-scoped Angular route:

- `/forge`

Do not hide Forge under existing routes like:

- `/jobs`
- `/datasets`
- `/viewer`

Forge is related to those surfaces, but it is not identical to any one of them.

## First UI shape

The first UI surface can be a single route with one shell component:

- `/forge`

That shell should be able to host these sections, even if only one is implemented initially:

- workbench
- queue
- results
- provenance

## Recommended first page

The first useful Forge page is a workbench.

It should contain:

- target name or RA/Dec input
- survey selection
- submit button
- recent jobs panel
- result preview panel

Current implemented shape on `/forge`:

- validated target, RA, Dec, and radius inputs
- survey chips with live, derived, planned, and registered states
- owned-job and global-queue panels
- selected-result shell with preview, artifact delivery labels, cache state, metadata, and provenance
- degraded and offline runtime messaging through the GraphQL read-model surface
- cache-artifact action for external provider assets

## Later route evolution

If the feature grows, the route can expand to:

- `/forge/workbench`
- `/forge/queue`
- `/forge/results`
- `/forge/provenance`

This should happen only after the single-route workbench proves its value.

## State ownership

The Forge UI route should own:

- Forge-specific NgRx slices
- Forge-specific GraphQL client wiring
- Forge-specific loading/error/empty states

It should not rely on incidental reuse of current jobs page state.

## Design constraint

The `/forge` route should feel like part of the same application, but it must remain visibly branch-scoped in code and routing so its architecture can evolve without corrupting the current app model.

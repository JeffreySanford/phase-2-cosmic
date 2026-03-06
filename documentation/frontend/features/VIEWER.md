# Viewer

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Mode B strategy: [../../viewer/VIEWER_MODEB.md](/docuentation/viewer/VIEWER_MODEB.md)
- Source contract: [../../viewer/VIEWER_SOURCE_CONTRACT.md](/docuentation/viewer/VIEWER_SOURCE_CONTRACT.md)
- Public data inventory: [../../../documentation/public-data/PUBLIC_DATA_RESOURCES.md](/documentation/public-data/PUBLIC_DATA_RESOURCES.md)
- Execution backlog: [../../../TODO.md](/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

## Purpose

Provide sky/object visualization with progressive resolution behavior that supports both fast exploration and deep inspection.

## Core behavior

- Default mode: `Auto` progressive resolution switching.
- Manual modes:
  - `High Resolution`
  - `Preview`
- Lower-left control must be present and persistent.
- Public NRAO/VLA viewer-ready assets should be used first where they reduce time-to-value for real sky imagery.

## Progressive switching policy

- Wide FOV uses preview survey tier.
- Mid/deep zoom progressively upgrades survey tier.
- Known-object mapping can bias survey selection toward better public imagery.
- Fallback logic must handle unavailable surveys without blank view states.
- Source attribution metadata must survive tier switches and fallback changes.

## UI requirements

- Lower-left mode control (`Auto`, `High Resolution`, `Preview`).
- Active survey label and source-state label (`live`, `fallback`, `mock`, `stale`).
- Source attribution in subdued small text when the active layer is externally sourced.
- Expandable detail surface for authoritative source URL, survey/dataset identifier, and retrieval/access context.
- Optional prompt when auto-switching at threshold crossings.

## Preferred public seed sources

| Use | Preferred source |
| --- | --- |
| Mid-zoom imagery | `VLASS` HiPS/basic products |
| Deep-zoom public fallback | `NVAS` historical image products |
| Metadata overlays | NRAO TAP service |
| Catalog/source overlays | `data.gov` `NVSS`, `VLSSr`, `QORG` |
| Timing/provenance enrichment | NIST timing data, NSF provenance/publication metadata |

## SSR and data delivery

- SSR can preload hints/config only.
- Final imagery remains client-side (Aladin/tile fetch path).
- SSR prefetch must be treated as optimization, not correctness dependency.

## Observability requirements

- track mode activations
- track survey switch events
- track tile load latency and error rates by source
- expose diagnostics for fallback frequency
- track source attribution render state so compact/expanded citation coverage can be verified

## Test requirements

Unit:

- threshold and mode-priority logic
- object-mapping selection

Integration:

- survey fallback under source failure
- switch behavior under repeated zoom events

E2E:

- lower-left control changes behavior
- zoom thresholds trigger expected survey changes in `Auto`
- source-state labels reflect actual path
- source citation renders when external imagery is active
- citation persists or updates correctly after fallback to another public source

## Related docs

- [../../VIEWER_MODEB.md](/docuentation/viewer/VIEWER_MODEB.md)
- [../../VIEWER_SOURCE_CONTRACT.md](/docuentation/viewer/VIEWER_SOURCE_CONTRACT.md)
- [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- [../../../documentation/public-data/PUBLIC_DATA_RESOURCES.md](/documentation/public-data/PUBLIC_DATA_RESOURCES.md)

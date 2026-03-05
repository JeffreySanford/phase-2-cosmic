# Viewer

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

## Purpose

Provide sky/object visualization with progressive resolution behavior that supports both fast exploration and deep inspection.

## Core behavior

- Default mode: `Auto` progressive resolution switching.
- Manual modes:
  - `High Resolution`
  - `Preview`
- Lower-left control must be present and persistent.

## Progressive switching policy

- Wide FOV uses preview survey tier.
- Mid/deep zoom progressively upgrades survey tier.
- Known-object mapping can bias survey selection toward better public imagery.
- Fallback logic must handle unavailable surveys without blank view states.

## UI requirements

- Lower-left mode control (`Auto`, `High Resolution`, `Preview`).
- Active survey label and source-state label (`live`, `fallback`, `mock`, `stale`).
- Optional prompt when auto-switching at threshold crossings.

## SSR and data delivery

- SSR can preload hints/config only.
- Final imagery remains client-side (Aladin/tile fetch path).
- SSR prefetch must be treated as optimization, not correctness dependency.

## Observability requirements

- track mode activations
- track survey switch events
- track tile load latency and error rates by source
- expose diagnostics for fallback frequency

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

## Related docs

- [../../VIEWER_MODEB.md](/docuentation/viewer/VIEWER_MODEB.md)
- [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)

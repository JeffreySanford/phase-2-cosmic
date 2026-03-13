# Angular Standards And Remediation

Status date: 2026-03-13

## Progress Update

Completed or materially addressed since this document was created:

- Coding standards were updated in [documentation/development/CODING-STANDARDS.md](/c:/repos/phase-2-cosmic/documentation/development/CODING-STANDARDS.md) to explicitly cover:
  - `standalone: false` module-mode policy
  - no standalone components by default
  - no Signals by default
  - Observable-first UI flows
  - lifecycle-safe initial render / `NG0100` avoidance
  - injected `DOCUMENT` / Angular-native DOM access expectations
- The `standalone: true` mismatch was fixed in [apps/frontend/src/app/features/telemetry/infra-tabs.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/telemetry/infra-tabs.component.ts).
- Raw global listener cleanup was completed or materially improved in:
  - [apps/frontend/src/app/base/footer/footer.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/base/footer/footer.component.ts)
  - [apps/frontend/src/app/services/snack.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/snack.service.ts)
  - [apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts)
  - [apps/frontend/src/app/features/topology/topology.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/topology/topology.component.ts)
  - [apps/frontend/src/app/features/viewer/viewer.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/viewer/viewer.component.ts)
- Direct `window.location` / `window` mode reads were cleaned up in:
  - [apps/frontend/src/app/app.module.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/app.module.ts)
  - [apps/frontend/src/app/features/landing/landing.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/landing/landing.component.ts)
  - [apps/frontend/src/app/services/data-source.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/data-source.service.ts)
  - [apps/frontend/src/app/services/jobs.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/jobs.service.ts)
- A shared browser helper now exists at [apps/frontend/src/app/services/browser-platform.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/browser-platform.service.ts) and is already used for repeated patterns such as:
  - custom window event dispatch
  - localStorage access
  - CSS variable reads
  - blob/download handling
- Blob/download browser logic was centralized out of:
  - [apps/frontend/src/app/features/telemetry/telemetry.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/telemetry/telemetry.component.ts)
  - [apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts)

Next steps (remaining work):

- ✅ `TopologyComponent` no longer contains direct D3/SVG DOM mutations; all rendering work is now isolated in `TopologyDomService`, and any browser-global APIs are routed through `BrowserPlatformService`.
- ✅ `ViewerComponent` Aladin boundary has been tightened so the only DOM boundary is `containerRef.nativeElement`, and the component now routes all browser globals (eg. resize timers, observers) through `BrowserPlatformService`.
- ✅ Added an automated check script (`scripts/check-browser-globals.js`, invoked via `pnpm run lint:browser-globals`) to detect new uses of `window.`, `document.`, `localStorage`, `querySelector`, etc.
- ✅ Resolved Angular 21 lifecycle test drift by stabilizing the failing `TelemetryComponent` spec (fixed HTTP mock flushes and adjusted expectations to match updated throughput formatting).

This document proposes explicit Angular coding-standard additions for this repository and summarizes the current remediation backlog for browser-global and direct-DOM usage in the frontend.

## Recommended Coding Standards Update

Add the following rules to the Angular section of [documentation/development/CODING-STANDARDS.md](/c:/repos/phase-2-cosmic/documentation/development/CODING-STANDARDS.md).

### Angular Architecture Policy

- Module-mode policy remains required: all `@Component` and `@Directive` declarations must explicitly set `standalone: false` unless a documented exception is approved.
- Standalone components are not allowed by default in this workspace. Any exception must be called out in documentation and justified by a migration plan.
- Angular Signals are not allowed by default in application code for this repository. Do not introduce `signal()`, `computed()`, or `effect()` without a documented workspace-level decision.
- Favor RxJS Observables for UI state, async workflows, polling, and cross-component communication. Do not introduce Promise-first UI flows where an Observable-based flow is more natural.
- `async`/`await` is acceptable at clear integration boundaries such as one-time bootstrapping, dynamic imports, and isolated browser APIs, but should not become the default reactive state-management pattern inside Angular components.

### Dependency Injection And Rendering

- Prefer Angular-native rendering and event abstractions over raw DOM APIs.
- Prefer `Renderer2.listen`, `@HostListener`, or RxJS `fromEvent` over direct `window.addEventListener` and `document.addEventListener`.
- Prefer injected `DOCUMENT` over direct `document` access when document access is required.
- Prefer `Renderer2` over direct DOM mutation for element creation, attribute/style changes, class toggling, and listener registration unless a third-party library requires native DOM handles.
- `ElementRef.nativeElement` is allowed only at integration boundaries where Angular abstractions are not practical, such as D3, canvas, SVG animation, or third-party viewer libraries. Keep such usage localized.
- Avoid `querySelector` / `querySelectorAll` in components when `@ViewChild`, `@ViewChildren`, bindings, directives, or Angular forms can express the same behavior.

### SSR And Browser Global Safety

- Never access `window`, `document`, `location`, `screen`, `MutationObserver`, `ResizeObserver`, or `localStorage` without considering SSR and test safety.
- Browser-global access must be guarded or wrapped behind Angular injection and lifecycle-safe code paths.
- Initial render must not synchronously mutate template-bound state in a way that triggers `ExpressionChangedAfterItHasBeenCheckedError`.

### Exceptions

- Acceptable exceptions include D3 rendering, fullscreen APIs, file download APIs, and third-party library bootstrapping where Angular does not provide a practical abstraction.
- Every exception should be isolated to a small adapter layer, helper service, or dedicated component boundary rather than spread across feature code.

## Current Scan Summary

Scan scope:

- `apps/frontend/src/app`
- `apps/frontend/src/index.html`
- Excluded: `*.spec.ts`, `assets`, markdown

Findings:

- `62` browser-global or direct-DOM matches
- `15` files with at least one match

Pattern counts:

- `window.`: `24`
- `nativeElement`: `18`
- `document.`: `14`
- `querySelector(`: `10`
- `addEventListener(`: `4`
- `dispatchEvent(`: `4`
- `createElementNS(`: `3`
- `removeEventListener(`: `2`
- `createElement(`: `2`
- `MutationObserver`: `2`
- `getComputedStyle(`: `1`

Most concentrated files:

- [apps/frontend/src/app/features/topology/topology.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/topology/topology.component.ts)
- [apps/frontend/src/app/features/telemetry/telemetry.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/telemetry/telemetry.component.ts)
- [apps/frontend/src/app/features/viewer/viewer.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/viewer/viewer.component.ts)
- [apps/frontend/src/app/services/snack.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/snack.service.ts)
- [apps/frontend/src/app/base/footer/footer.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/base/footer/footer.component.ts)
- [apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts)

## Remediation List

Ranked first by severity, then by ease of cleanup.

### 1. High Severity, Easy Wins

- Completed: replace raw global event listeners in [apps/frontend/src/app/base/footer/footer.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/base/footer/footer.component.ts)
  Current smell:
  `window.addEventListener("resize", ...)`
  Recommended fix:
  use `Renderer2.listen("window", "resize", ...)` or `fromEvent(window, "resize")` with teardown.

- Completed: fix page‑scroll layout for landing/dashboard/topology and
  eliminate nested scrollbars in telemetry. Earlier global `overflow` rules
  prevented home/dashboard scrolling and a built‑in card scrollbar caused
  a second scrollbar on telemetry; all affected components now follow a
  consistent flex/overflow pattern (host fills stage, inner container
  scrolls, or page scroll handles overflow) and global overflow is allowed.
  This work is mostly cosmetic but dramatically improves navigation when
  feature pages grow beyond a single viewport.

- Completed: replace raw global event listeners in [apps/frontend/src/app/services/snack.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/snack.service.ts)
  Current smell:
  direct `window.addEventListener`, `document.querySelector`, `document.documentElement.style.setProperty`
  Recommended fix:
  wrap footer-height syncing behind `Renderer2`, injected `DOCUMENT`, and a single lifecycle-managed listener.

- Completed: replace direct input event wiring in [apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts)
  Current smell:
  `document.querySelectorAll(...).forEach(el => el.addEventListener(...))`
  Recommended fix:
  use Angular form bindings, template events, or a directive.

### 2. High Severity, Medium Effort

- Completed: reduce browser-global access in [apps/frontend/src/app/features/topology/topology.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/topology/topology.component.ts)
  Current smell:
  direct `window`, `document`, `nativeElement`, `querySelector`, fullscreen calls, manual SVG element creation, manual timers
  How it was fixed:
  all D3/SVG rendering and DOM mutation is now isolated in `TopologyDomService`, and browser globals are routed through `BrowserPlatformService`.

- Completed: audit and refactor [apps/frontend/src/app/features/viewer/viewer.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/viewer/viewer.component.ts) to align with the browser-global policy.
  What changed:
  - Converted init flow to a hot `Observable` pipeline (no Promise-driven UI flow)
  - Removed unused global imports and ensured `nativeElement` usage is strictly bounded to the single integration boundary
  - Eliminated unsafe `!` assertions and fixed lifecycle race hazards by sharing init results via `shareReplay`
  - Verified behavior via unit tests (all frontend tests passing)

### 3. Medium Severity, Easy Wins

- Completed: replace direct `window.location` and `window` mode reads in:
  [apps/frontend/src/app/app.module.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/app.module.ts)
  [apps/frontend/src/app/features/landing/landing.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/landing/landing.component.ts)
  [apps/frontend/src/app/services/data-source.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/data-source.service.ts)
  [apps/frontend/src/app/services/jobs.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/jobs.service.ts)
  Recommended fix:
  centralize these behind an environment/browser helper service or injected `DOCUMENT`.

- Completed: replace direct export/download DOM creation in:
  [apps/frontend/src/app/features/telemetry/telemetry.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/telemetry/telemetry.component.ts)
  [apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/diagnostics/trident-allocator/trident-allocator.component.ts)
  Recommended fix:
  move download logic into a shared browser utility service.

### 4. Medium Severity, Medium Effort

- Refactor [apps/frontend/src/app/features/telemetry/telemetry.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/telemetry/telemetry.component.ts)
  Current smell:
  `ElementRef`, `getComputedStyle`, direct anchor creation, and chart container native access
  Recommended fix:
  preserve native access for D3 chart rendering where needed, but isolate the DOM-heavy chart logic into a dedicated adapter/service and move file export into a helper.

- Completed enough for current standards goals: refactor [apps/frontend/src/app/base/footer/footer.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/base/footer/footer.component.ts)
  Current smell:
  direct DOM queries for footer sizing
  Recommended fix:
  use `Renderer2`, `ResizeObserver` abstraction, or a dedicated layout service.

### 5. Lower Severity / Intentional Exceptions

- [apps/frontend/src/index.html](/c:/repos/phase-2-cosmic/apps/frontend/src/index.html)
  These are shell/bootstrap level browser hooks, not normal Angular component code. Keep them minimal and document why they cannot live inside Angular.

- [apps/frontend/src/app/shared/directives/dynamic-style.directive.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/shared/directives/dynamic-style.directive.ts)
  This is an intentional Angular-approved escape hatch. Keep it as the preferred alternative to inline template styles.

## Recommended Work Order

1. Continue using [apps/frontend/src/app/services/browser-platform.service.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/services/browser-platform.service.ts) to retire remaining repeated browser/global patterns.
2. Finish narrowing `TopologyComponent` and `ViewerComponent` to clear adapter boundaries.
3. Keep fixing Angular 21 lifecycle-related spec drift so test behavior matches deferred first-render behavior.
4. Enforce the standards in linting or code review with a small banned-pattern checklist.

## Immediate Policy Gaps To Fix

- These policy gaps were closed in [documentation/development/CODING-STANDARDS.md](/c:/repos/phase-2-cosmic/documentation/development/CODING-STANDARDS.md).
- The prior direct standards mismatch in [apps/frontend/src/app/features/telemetry/infra-tabs.component.ts](/c:/repos/phase-2-cosmic/apps/frontend/src/app/features/telemetry/infra-tabs.component.ts) was fixed.

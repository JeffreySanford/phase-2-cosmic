# Browser-global remediation (Angular frontend)

> This document tracks the cleanup and ongoing enforcement of the policy that Angular code must not use raw browser globals (e.g. `window`, `document`, `querySelector`, etc.) directly.

## Where the policy lives

- **Policy text**: [documentation/development/CODING-STANDARDS.md](../development/CODING-STANDARDS.md) (Angular section)
- **Enforcement**: `pnpm run lint:browser-globals` (scan for banned patterns)

## Current status (2026-03-13)

- ✅ `pnpm run lint:browser-globals` reports **no violations** in `apps/frontend/src/app`.

## How to validate (quick sanity check)

1. Run:
   - `pnpm run lint:browser-globals`
2. If it fails, fix the reported occurrences by routing browser globals through one of the approved adapters:
   - `BrowserPlatformService` (`apps/frontend/src/app/services/browser-platform.service.ts`)
   - injected `DOCUMENT`
   - `Renderer2`, `@HostListener`, or `fromEvent(...)`

## How to keep it clean

- When adding UI code, **do not** use `window.`, `document.`, `querySelector`, `localStorage`, etc. directly.
- If you need browser APIs, wrap them behind a small service or adapter, and keep the raw access isolated.
- Update this document only if the scan tool changes (new patterns added) or the enforcement approach changes.

---

## Historical context (for reviewers)

These items were remediated during the cleanup effort (existing code no longer violates the policy):

- Browser-global access unified via `apps/frontend/src/app/services/browser-platform.service.ts`.
- Removed raw `window.*`, `document.*`, `querySelector`, and manual DOM mutation from key components and services (topology, telemetry, viewer, snackbar, footer, etc.).
- Fixed Angular 21 lifecycle-related spec drift by stabilizing key component tests.

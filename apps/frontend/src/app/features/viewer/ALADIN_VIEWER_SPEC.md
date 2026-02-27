# Aladin Lite Viewer - Component Specification

This document specifies the `ViewerComponent` which embeds Aladin Lite into the Angular application.

## Purpose

Provide a reusable Angular component that initializes and hosts an Aladin Lite sky viewer using Angular best practices (DOM access via `Renderer2` and `DOCUMENT`). The component must handle UMD vs ESM bundles, local asset fallbacks, WASM initialization race, and expose a clear API for parent components.

## Public API

- Inputs
  - `survey?: string` — HiPS survey URL or identifier. Default: `https://healpix.ias.u-psud.fr/CDS_P_DSS2_color`.
  - `fov?: number` — Field of view in degrees. Default: `60`.
  - `target?: string` — Initial target (e.g. `M42`). Default: `"M42"`.
  - `showReticle?: boolean` — Show reticle. Default: `false`.
  - `showLayersControl?: boolean` — Default: `false`.
  - `showZoomControl?: boolean` — Default: `false`.
  - `showFullScreenControl?: boolean` — Default: `false`.

- Outputs
  - `ready: EventEmitter<AladinInstance>` — Emitted when the viewer is successfully created.
  - `error: EventEmitter<any>` — Emitted on failure to initialize.

## Lifecycle & Behavior

- On `ngAfterViewInit`:
  - Create a container element via `Renderer2` (or use `@ViewChild` container) and ensure it's sized.
  - Attempt to load the Aladin runtime in this order when running on `localhost`:
    - `/assets/aladin.umd.min.js`
    - `/assets/aladin.umd.cjs`
    - `/aladin.umd.min.js`
    - Import package `aladin-lite` as ESM fallback.
  - Detect UMD vs ESM by fetching the asset and scanning for UMD markers; import ESM via a blob URL using `/* @vite-ignore */`.
  - For UMD, inject a script via `Renderer2` and wait for the global `aladin` object.
  - Await any `init` exported by the module and poll for `wasmLibs.core` to avoid the `WebClient` race.
  - Resolve a factory function to create the viewer and call it with the provided options.
  - Emit `ready` with the `AladinInstance` or `error` on failure.

- On `ngOnDestroy`:
  - Attempt to properly destroy the Aladin instance (call `instance.remove` or `instance.destroy` if present).
  - Remove any injected script tags created by the component.

## Error Handling & Retries

- If `factory('#id', opts)` throws due to transient internal undefined symbols (e.g. `WebClient`), retry several times with exponential backoff before emitting `error`.

## Accessibility

- The container must have `role="region"` and `aria-label="Sky viewer"`.

## Implementation Notes

- Use `Renderer2` for DOM mutations and `@Inject(DOCUMENT)` to access `document`/`location` safely.
- Keep implementation testable and side-effect free from constructors.
- Keep the loader logic contained in private helper methods.

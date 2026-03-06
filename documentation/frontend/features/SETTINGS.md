# Settings

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

The Settings page centralizes application configuration and developer-facing toggles. It provides safe controls for non-destructive runtime settings, links to configuration files, and export/import capabilities.

## Purpose

- Let operators and developers view and manage application preferences, telemetry endpoints, diagnostic toggles, and feature flags.

## Sections

- **Application configuration**: display (and optionally edit if allowed) core settings such as the Prometheus proxy URL, static asset base path, and API timeouts.
- **Global stress profile status**: read-only display of the active footer-selected profile and an explanation of current mode (`scaffold` vs `runtime-controlled` when available).
- **Diagnostics controls**: guidance and links for enabling `DIAG_RUN` in development (the page should not run diagnostics directly but should link to the compose example and documentation).
- **Telemetry & scraping**: show where Prometheus is scraped from and provide quick links to the Telemetry docs.
- **Export / Import**: allow configuration export (JSON) and import for local dev convenience.

## Security & governance

- Settings that can alter runtime behavior (feature flags, network targets) must be guarded and documented. Prefer read-only exposure in production builds.

## Implementation hints

- Persist settings in browser-local storage for local preferences; surface server-managed configuration via read-only server endpoints for global settings.
- Avoid exposing secrets through the UI; any secret-valued config must be edited only via secure channels.
- Keep stress-profile control centralized in the footer for fast operator access across routes; Settings should document and explain behavior rather than duplicate the primary control.

# Forge Demo Checklist

Alignment anchors

- Runbook: [./RUNBOOK.md](./RUNBOOK.md)
- PI tracker: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- UI surface: [./UI_SURFACE_PLAN.md](./UI_SURFACE_PLAN.md)

Status: `implemented`

## Purpose

This is the minimal operator/demo walkthrough for proving the current Forge branch is a real PI deliverable rather than a partially assembled prototype.

## Demo checklist

- [ ] Start the local runtime with `pnpm run start:all`.
- [ ] Open `http://127.0.0.1:4200/forge`.
- [ ] Confirm the runtime banner says Forge is available.
- [ ] Confirm the GraphQL read-model panel reports `contract version: forge-workbench.v1`.
- [ ] Confirm live survey options include:
  - `Legacy Surveys`
  - `AllWISE`
  - `SkyView`
- [ ] Create a cutout job using `Legacy Surveys` or `AllWISE`.
- [ ] Confirm the job appears in the queue with an explicit lifecycle state.
- [ ] Select the completed job and verify:
  - preview is visible
  - provenance is visible
  - provider-labeled citation/source links are present
  - FITS link exists when applicable
- [ ] Create a composite job using `Legacy Surveys` + `AllWISE`.
- [ ] Confirm the composite result is marked as a Forge-generated derived preview.
- [ ] Confirm diagnostics show queue state, cache metrics, and recent job events.
- [ ] Retry or cancel one queue item and confirm the queue shell reflects the lifecycle update.
- [ ] Refresh `/forge` and confirm the read model and queue state reload cleanly.

## Demo notes

- `SkyView` should be explained as a derived quick-look comparison output, not an archive-native cutout.
- `ESASky` is intentionally shown as planned, not live.
- If an upstream provider is unavailable, the demo is still valid if Forge shows a normalized provider failure code and readable error message.

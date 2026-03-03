# MVP ACCEPTANCE CRITERIA

## Purpose

Define MVP exit criteria for a local, reproducible control-plane and operator console that can demonstrate submit -> observe -> recover workflows aligned to published ngVLA mission and reference-design context.

## Scope

- Java governance API: health, jobs, datasets, lifecycle transitions, durability behavior.
- Go ingest/processor path: idempotent ingest and replay-safe behavior for duplicate payloads.
- Frontend operator UI: `Jobs`, `Datasets`, `Diagnostics`, `Topology` pages wired to local APIs.
- Demo/playground execution on a developer workstation.

## NGVLA Reference Baseline (for MVP modeling)

The MVP must encode and preserve these domain assumptions in docs, fixtures, and UI labels:

1. ngVLA reference design includes 214 main-array 18 m antennas, 30 long-baseline 18 m antennas, and 19 short-baseline 6 m antennas.
2. Frequency range used in platform metadata and validation is 1.2-116 GHz.
3. Long baselines are represented up to continental scales (~8,636-9,000 km) in topology/domain metadata.
4. Mission framing remains tied to the five Key Science Goals and proposal-driven operations.
5. Project maturity is treated as evolving design work (not operational telescope control), consistent with current timeline milestones.

## Functional Acceptance Criteria

1. Health and API readiness
   - `GET /api/v1/health` returns HTTP 200 and build/runtime identity.
2. Job lifecycle
   - `POST /api/v1/jobs` returns 201 and a non-empty `jobId`.
   - `GET /api/v1/jobs/{id}` returns current state and lifecycle metadata.
   - Supported transitions include `QUEUED -> RUNNING -> COMPLETED|FAILED|CANCELED`.
   - Restart durability check passes: `QUEUED`/`RUNNING` jobs are recoverable after service restart.
3. Ingest path
   - Ingest endpoint accepts telemetry/event payloads and behaves idempotently for duplicate submissions.
4. Dataset and provenance baseline
   - `Datasets` API/UI supports create/list/detail and links datasets to originating workflow/job context.
5. UI mission workflow
   - `Jobs` page supports submit, list, detail, and visible state transitions.
   - `Diagnostics`/`Topology` display live health/metrics and expose degraded vs recovered states.
6. NGVLA model fidelity in product surfaces
   - Topology, mock fixtures, and copy do not contradict the documented ngVLA reference configuration or frequency range.
   - Domain labels distinguish `Main`, `Long Baseline`, and `SBA` concepts where represented.
7. Demo execution
   - `DEMO_CHECKLIST.md` runs end-to-end locally with observable pass/fail outcomes.  
  *Note: the playground is now implemented and has been exercised successfully during development.*

## Non-Functional Acceptance Criteria

- Local reproducibility: `pnpm run start:all` (or `sh ./scripts/start-all.sh`) boots stack and frontend SSR reliably.
- Observability baseline: each runtime exposes health and at least one metrics surface.
- Contract integrity: OpenAPI and fixture checks pass for primary governance paths.
- Test baseline: critical unit/integration coverage exists for lifecycle transitions and ingest error/idempotency paths.

## Success Metrics (MVP Targets)

- Job submission latency: median < 2s, p95 < 5s on developer workstation during demo.
- Durability: restart test proves lifecycle state continuity for in-flight jobs.
- End-to-end loop: at least one representative submit -> observe -> recover cycle passes in one demo run.
- Domain correctness: no known mismatch between NGVLA reference facts in docs/fixtures/UI and cited sources below.

## Exit Criteria

1. All functional and non-functional criteria above pass and are evidenced in demo notes.
2. Demo checklist passes without undocumented manual workarounds.
3. Mission linkage remains explicit: each accepted MVP capability maps to at least one mission outcome in `docuentation/ngvla/NGVLA_MISSION_ALIGNMENT.md`.
4. Deferred post-MVP items (CI hardening, broader security/compliance, production deployment) remain documented in roadmap/backlog.

## Sources (NGVLA web research)

- ngVLA FAQ (configuration, frequency range, baseline context): <https://ngvla.nrao.edu/page/faq>
- ngVLA Array Configuration (Main/Long/SBA structure and baseline ranges): <https://ngvla.nrao.edu/page/array-config>
- ngVLA Timeline (current project milestones, incl. 2024 CDR pass and 2026 activity): <https://ngvla.nrao.edu/page/timeline>
- Key Science Goals update (2024, SAC/community): <https://arxiv.org/abs/2408.14497>

## Notes

All NGVLA values above are treated as reference-design inputs for platform modeling and demo realism. They are not claims that this MVP controls or represents full observatory operations.

## Post-MVP Next Steps

1. Add `docuentation/ngvla/NGVLA_REFERENCES.md` as the canonical source map for accepted NGVLA facts.
2. Add NGVLA array fixtures for `main`, `long-baseline`, and `sba` entities used by local demos.
3. Extend API/domain contracts to carry `arraySegment`, `antennaClass`, and `frequencyBandGHz` metadata.
4. Add tests that fail on drift from approved NGVLA constants used in docs/contracts/fixtures.
5. Add an automated demo verification script (`scripts/demo-verify.sh`) for checklist pass/fail output.
6. Add CI documentation checks for broken links and required source citations in MVP/demo docs.
7. Update `Topology` copy/tooltips to consistently use `Main`, `Long Baseline`, and `SBA` labels.
8. Add explicit modeling disclaimer UI text to avoid implying live observatory control.
9. Extend `Datasets` UI with baseline provenance linkage to originating workflow/job.
10. Run and archive a full checklist dry-run with command output and screenshots in `demo-notes/`.

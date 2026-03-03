# DEMO CHECKLIST (NGVLA-ALIGNED MVP)

## Purpose

Run a short, repeatable local demo that proves MVP acceptance criteria and verifies NGVLA-aligned domain fidelity in docs, fixtures, API responses, and UI.

## Prerequisites

- Docker running.
- `pnpm` available (or `npx pnpm@latest`).
- Ports 8080, 8081, 8082, 3000, 4000, 6379, 9090 available (or overridden).
- Local `.env` configured for demo defaults.

## Quick Start

1. Install dependencies:

```bash
npx pnpm@latest install --no-frozen-lockfile
```

1. Start stack:

```bash
pnpm run start:all
# or
sh ./scripts/start-all.sh
```

1. Verify service health:

```bash
curl -fsS http://localhost:8082/api/v1/health || echo "governance down"
curl -fsS http://localhost:8081/actuator/health || echo "java-ingest down"
# frontend SSR: http://localhost:4000
```

## Core Flow: Submit -> Observe -> Recover

1. Submit a job:

```bash
curl -s -X POST http://localhost:8082/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"workflow":"demo","parameters":{"mission":"ngvla-mvp"}}' | jq
```

1. Poll the created job:

```bash
curl -s http://localhost:8082/api/v1/jobs/<jobId> | jq
```

1. Validate UI behavior:

- Open `http://localhost:4000` and confirm `Jobs` shows the submitted job and lifecycle updates.
- Open `Datasets` and confirm list/detail rendering works.
- Open `Diagnostics` and `Topology` and confirm live health/metrics visibility.

1. Validate recovery:

- Restart governance service.
- Re-run `GET /api/v1/jobs/<jobId>` and verify lifecycle state continuity.

## NGVLA Domain Fidelity Checks

Run these checks against docs/fixtures/UI labels used in the demo:

1. Configuration values match reference assumptions:
   - `214` main-array `18 m` antennas.
   - `30` long-baseline `18 m` antennas.
   - `19` short-baseline `6 m` antennas.
2. Frequency range displayed or validated in metadata is `1.2-116 GHz`.
3. Topology/domain copy distinguishes `Main`, `Long Baseline`, and `SBA` concepts when shown.
4. No demo narrative claims full observatory operations; wording stays at "reference architecture prototype / control-plane modeling" level.

## Validation Points (Pass/Fail)

- Health endpoints return success for required services.
- Job submission returns `jobId` and lifecycle progresses.
- UI reflects lifecycle and service state changes without manual API-only fallback.
- Restart durability check passes.
- NGVLA domain fidelity checks pass.
- p95 submit-to-visible-state latency remains < 5s in local run.

## Evidence to Capture

- Terminal snippets for health and job lifecycle calls.
- One screenshot each: `Jobs`, `Diagnostics` or `Topology`.
- Short note for any deviation, with observed behavior and probable cause.

## Marking Demo as Passed

1. All validation points pass.
2. No unresolved blocker remains for submit -> observe -> recover.
3. NGVLA domain checks pass against cited sources.
4. Any deviation is logged with owner and follow-up item.

## Sources (NGVLA web research)

- FAQ: <https://ngvla.nrao.edu/page/faq>
- Array Configuration: <https://ngvla.nrao.edu/page/array-config>
- Timeline: <https://ngvla.nrao.edu/page/timeline>
- Key Science Goals Update (2024): <https://arxiv.org/abs/2408.14497>

## Troubleshooting

- If `pnpm` install fails, use `npx pnpm@latest` with `--store-dir ./pnpm-store`.
- If ports conflict, set env overrides before `start:all`.
- If API checks pass but UI appears stale, hard-refresh SSR page and verify backend URL/proxy env settings.

## Next Steps After Demo Pass

1. Add `docuentation/ngvla/NGVLA_REFERENCES.md` and use it as the canonical citation target for demo/domain checks.
2. Add NGVLA array fixtures (`main`, `long-baseline`, `sba`) and include them in demo seed data.
3. Validate API/domain fields for `arraySegment`, `antennaClass`, and `frequencyBandGHz`.
4. Add regression tests that fail on NGVLA constant drift.
5. Add `scripts/demo-verify.sh` to automate this checklist and print pass/fail summary.
6. Add CI docs checks for broken links and required source citations.
7. Normalize `Topology` UI terminology to `Main`, `Long Baseline`, `SBA`.
8. Add a visible modeling disclaimer banner in demo UI routes.
9. Add dataset provenance linkage checks (workflow/job references) to demo validation.
10. Store a full dry-run evidence bundle in `demo-notes/` (terminal output + screenshots + deviations).

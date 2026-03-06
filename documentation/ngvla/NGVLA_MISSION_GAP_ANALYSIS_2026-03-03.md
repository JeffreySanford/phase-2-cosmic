# ngVLA Mission Gap Analysis (2026-03-03)

Purpose: identify oversights in current roadmap/backlog relative to ngVLA mission objectives and current project references.

## Source basis (reviewed 2026-03-03)

- ngVLA main overview and mission framing: <https://ngvla.nrao.edu/>
- ngVLA science page (community-driven key science goals): <https://ngvla.nrao.edu/page/science>
- ngVLA FAQ (science-ready data and broad observatory posture): <https://ngvla.nrao.edu/page/faq>
- ngVLA design documentation index (operations, timing, calibration, RFI/EMC, AIV/CSV, safety): <https://ngvla.nrao.edu/page/projectdocs>

## Gaps identified vs current planning

1. Time/frequency synchronization quality is not yet explicit in data quality gates.

- Why it matters:
  - Interferometry requires strict timestamp and timing-reference integrity.
- Current state:
  - Data quality standards include generic timestamp checks but no timing-budget-specific controls.
- Needed:
  - explicit timing metadata fields, quality checks, and alert thresholds.

1. RFI/EMC observability and mitigation loop is not explicit in runtime planning.

- Why it matters:
  - RFI directly affects science product trust and ingest stability.
- Current state:
  - no dedicated RFI/EMC metrics and incident workflow in roadmap/TODO.
- Needed:
  - RFI event model, quality flags, and operator visualization surfaces.

1. VO interoperability is only partially covered (ObsCore fields) but service endpoints are not planned.

- Why it matters:
  - community archive access relies on standards-based discovery/access patterns.
- Current state:
  - ObsCore-aligned metadata fields are planned.
- Needed:
  - TAP/ADQL + DataLink/SODA compatibility planning and contract tests.

1. Commissioning/AIV-readiness data scenarios are not first-class test tracks.

- Why it matters:
  - ngVLA project docs emphasize AIV/CSV and staged readiness.
- Current state:
  - general stress and replay tests exist, but no commissioning profile set.
- Needed:
  - commissioning scenario suite and acceptance gates.

1. Archive continuity and disaster-recovery replication are not explicit for 240 PB path.

- Why it matters:
  - mission continuity requires recoverable, durable archive posture.
- Current state:
  - tiered storage and governance exist; DR/RPO/RTO targets are not explicit.
- Needed:
  - cross-site replication policy, restore drills, and RPO/RTO gates.

1. Low-latency transient/multi-messenger alert path is under-specified.

- Why it matters:
  - ngVLA KSG5 and transient science benefit from low-latency event handling.
- Current state:
  - generic ingest/replay planning exists.
- Needed:
  - alert-priority routing and latency SLO for transient/event triggers.

## Added planning actions

- Added root backlog section `5F. ngVLA mission oversights closure`.
- Added roadmap section `Phase 2A: Mission-critical closure track`.
- Added mission trace rows for timing integrity, RFI/EMC loop, VO services, and archive DR.
- Added mission gate criteria for timing quality, RFI observability, VO endpoint conformance, and DR drill evidence.
- Added detailed implementation plans under `docuentation/mission-closure/`:
  - `TIMING_INTEGRITY_PLAN.md`
  - `RFI_EMC_OBSERVABILITY_PLAN.md`
  - `VO_INTEROPERABILITY_PLAN.md`
  - `COMMISSIONING_AIV_PLAN.md`
  - `ARCHIVE_DR_REPLICATION_PLAN.md`
  - `TRANSIENT_ALERT_PATH_PLAN.md`

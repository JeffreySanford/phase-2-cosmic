# MG-5: Archive DR Replication & Restore Drills

Owner: Storage + Operations

## Goal

Define cross-site replication policy, RPO/RTO targets, and restore‑drill tooling for the archive (240 PB path).

## Deliverables

- Replication policy document and IaC checklist.
- Restore‑drill playbook and scripts to validate data recovery flows.
- Tests: smoke restore drills in a controlled environment (small dataset) and CI gating for playbook readiness.

## Acceptance Criteria

- Replication policy documented and approved.
- Restore‑drill scripts can perform a full roundtrip on a representative sample dataset.

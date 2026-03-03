# VO Interoperability Expansion Plan

Status: planned  
Owner: Data Architecture + API Contracts  
Related backlog: `TODO.md` `MG-3`

## Problem

The platform currently plans ObsCore-aligned metadata fields, but service-level interoperability (query and access protocols) is not yet planned. Field alignment alone is insufficient for standards-based archive discovery and tool compatibility.

Current platform risk:
- archive discovery may remain custom-only
- external astronomy tools cannot reliably query/access products
- long-term community interoperability expectations are unmet

## Why this is necessary

- Ensures products can be discovered/accessed through widely adopted astronomy interfaces.
- Reduces lock-in to custom UI/API paths.
- Supports reproducible science through standards-conformant access patterns.

## What this enables

- standards-compatible discovery/query workflows
- interoperable integration with external science toolchains
- clearer long-term archive contract stability

## Planned integration steps

1. Standards scope definition
- Keep ObsCore field mapping as baseline.
- Add service compatibility planning for:
  - TAP/ADQL query interface
  - DataLink association interface
  - SODA-style data access patterns

2. Contract integration
- Add representative query/access examples to API docs and fixtures.
- Define mapping from internal dataset model to standards response shapes.
- Add compatibility/versioning notes for future extensions.

3. Conformance validation
- Build test scenarios for representative ADQL filters and dataset access.
- Validate required metadata presence/type/range constraints.
- Add CI conformance lane for interoperability checks.

4. Operational guidance
- Document supported query patterns and limitations.
- Add runbook entries for compatibility regressions.

## Acceptance criteria

- Representative TAP/ADQL scenarios pass conformance tests.
- DataLink/SODA mapping is documented and validated.
- Compatibility regressions fail CI before merge.

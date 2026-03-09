# Trident Gateway Overview

This document is aimed at operators and developers who need to understand the
core pieces of the Trident gateway / execution‑layer.

## Schemas

The gateway supports a set of JSON schemas registered with the `SchemaService`.
Key entities are:

- `SchedulingBlock` – observation intent supplied by the planner.
- `ExecutionBlock` – validated and optionally augmented plan ready for
  execution.
- `SubarrayConfiguration` – hardware selection details.
- `SpectralConfiguration` – frequency/zoom settings.
- `FspAllocationPlan` – finite FSP allocation results produced by the simulator.

Schemas live under `apps/java-governance/src/main/resources/schemas/trident/`.
Each schema has a matching Java record type and a TypeScript interface used on
the frontend.

The OpenAPI spec includes fragments for payloads that reference these schemas;
`pnpm run openapi-validate` is used to smoke-check contract changes.

## Allocator Simulator

A simple REST service under `tools/trident-allocator` evaluates a
`SchedulingBlock` and returns either a successful `FspAllocationPlan` or a
`409 Conflict` with diagnostics. It exists to detect over-allocation before
jobs are submitted downstream.

Run the simulator harness with:

```bash
cd tools/trident-allocator
yarn install        # or pnpm install
node index.js       # starts server on 3000
```

Tests live in the same folder and can be exercised via `pnpm run
test:trident-allocator` from the repo root.

## Execution API

The gateway exposes four primary endpoints under `/api/v1/execution`:

- `POST /plans` – validate a scheduling block (schema + allocator) and return
  a generated `planId`.
- `POST /plans/{id}/apply` – apply a validated plan; requests must include an
  `Idempotency-Key` header. Duplicate keys return `409`.
- `GET /plans/{id}` – retrieve status and history for an execution plan.
- `AuthFilter` ensures JWT-based role checks on all execution endpoints.

These endpoints are implemented in `apps/frontend/src/app/controllers` and
simulated during local development by the Nest server when `USE_EMBEDDED_E2E_BACKEND`
is enabled.

The frontend code (jobs, execution plans) interacts with these APIs via
`jobs.service.ts` and `execution-plans.service.ts`.

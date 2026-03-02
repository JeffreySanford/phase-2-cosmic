# Demo Playground

This document explains how to start and exercise the minimal demo/playground that
was built as part of the MVP development cycle.  Its goal is to show the
`submit -> observe -> recover` workflow end‑to‑end on a single developer
workstation with as few dependencies as possible.

## Prerequisites

- Docker and docker-compose installed and running
- `pnpm` and `node` for frontend dependencies
- JDK 17 + Maven for Java modules (optional, the demo uses prebuilt images)
- Git checkout of the `phase-2-cosmic` repository root

## Starting the playground

1. Build (or pull) the required container images. From repository root run:

   ```bash
   # build governance & ingest images (will also install parent POM)
   docker build -f apps/java-governance/Dockerfile -t phase2/java-governance:local apps/java-governance
   docker build -f tools/java-ingest/Dockerfile -t phase2/java-ingest:local tools/java-ingest
   
   # frontend is built via pnpm
   pnpm -C apps/frontend build
   ```

2. Bring up the compose stack:

   ```bash
   docker compose -f docker/dev-compose.yml up -d
   ```

   This will start Redis, Kafka, governance, ingest bridge, and supporting
   telemetry mocks. Give the containers a minute to settle.

3. Start the frontend SSR Nest server so the UI is available on port 4000:

   ```bash
   pnpm run serve:ssr
   ```

   The UI will be reachable at `http://localhost:4000`.  (If you prefer the
   legacy Angular dev server, use `pnpm -C apps/frontend serve` instead, but
   SSR is closer to the production build used in the demo.)

## Exercising the workflow

1. Open the browser at <http://localhost:4000> and navigate to the **Jobs** page.
   The page should load and show an empty job list.

2. Click **Submit job**, fill in a workflow name (e.g. `demo-workflow`), any
   dataset ID, and click **Submit**.  You should see the new job appear in the
   list with status `QUEUED`.

3. Switch to the **Diagnostics** page to watch logs/metrics.  Within a few
   seconds the job will transition to `RUNNING` and then `COMPLETED`.  The UI
   updates automatically via polling.

4. To test recoverability, restart the governance container:

   ```bash
   docker restart java-governance
   ```

   After the service comes back up, refresh the Jobs page; any job that
   previously existed should retain its state (`COMPLETED` in this case).

5. You can also submit the same job payload multiple times (duplicate
   `jobId` detection) and observe that the service handles duplicates
   idempotently.

6. Inspect the `docker/dev-compose.yml` logs for the ingest bridge and Kafka
   consumer to see the event flow, or run the `tools/perf/run-profile.sh smoke`
   to generate a burst of synthetic jobs.

## Notes

- The playground is intentionally lightweight; long-running data and operators
  are not persisted beyond the `redis` container volume.  To start fresh,
  `docker compose down -v` will remove volumes.

- For a more complete demo script with pass/fail output, see the TODO item
  for `scripts/demo-verify.sh` in the project backlog.

- After exploring the playground, you can tear it down:
  `docker compose -f docker/dev-compose.yml down -v` and stop the frontend
  server with Ctrl-C.

## Linking to MVP docs

This file is referenced from the `MVP_ACCEPTANCE_CRITERIA.md` and can be used
as the central guide when running the demo checklist.  An automated verifier
script `/scripts/demo-verify.sh` provides a pass/fail summary for repeatable
runs.

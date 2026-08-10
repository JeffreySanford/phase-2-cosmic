# Docker Environment

Alignment anchors

- Local dev baseline: [../overview/GETTING_STARTED.md](../overview/GETTING_STARTED.md)
- Docker topology baseline: [../infra/INFRA_TOPOLOGY.md](../infra/INFRA_TOPOLOGY.md)
- Implementation plan: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

Status: `implemented`

## Decision

Cosmic Forge gets its own Docker environment and does not extend the default `docker/dev-compose.yml` hot path.

The new file is:

- [`docker/cosmic-forge-compose.yml`](/c:/repos/phase-2-cosmic/docker/cosmic-forge-compose.yml)

The wrapper scripts are:

- [`scripts/cosmic-forge-up.sh`](/c:/repos/phase-2-cosmic/scripts/cosmic-forge-up.sh)
- [`scripts/cosmic-forge-down.sh`](/c:/repos/phase-2-cosmic/scripts/cosmic-forge-down.sh)

## Why a separate environment

The current Phase 2 Docker environment is a broker-heavy control-plane lab. It is useful, but it is not the right default runtime shape for Forge v1.

Reasons:

- current frontend local dev is hybrid and SSR/proxy-led
- current compose stack already includes Java governance, Kafka, RabbitMQ, Pulsar, and observability services
- BookKeeper/Pulsar health is not strong enough to make it a safe default Forge dependency
- Forge v1 does not need every current broker just to prove image orchestration

## Root `.env` rule

Cosmic Forge local development uses the repository root `.env`.

This keeps secret handling and local overrides consistent with the rest of the workspace and avoids inventing a second secret-loading story for the branch.

The wrapper scripts load:

- `.env` first
- `.env.sample` as fallback

They also pin the Compose project name to `cosmic-forge` so the bounded-track stack does not collide with the main `docker/` stack through implicit project naming.

## Current scope of the Forge compose file

The initial Forge compose environment provides support services only:

- PostgreSQL for metadata
- Redis for cache/state coordination
- MinIO for artifact storage

This is no longer storage-only.

The compose environment now includes the current runtime services:

- `cosmic-forge-api`
- `cosmic-forge-worker`

These service boundaries are now implemented as the current typed Forge API and worker runtimes. The compose environment remains the bounded local runtime seam for operating the branch alongside the main stack.

## Port strategy

Forge ports deliberately avoid the current stack defaults:

- Postgres: `55432`
- Redis: `6380`
- MinIO API: `9001`
- MinIO Console: `9002`
- Forge API: `4101`
- Forge Worker: `4102`

All of these can be overridden through the root `.env`.

## Known local startup collisions

The current local dev/runtime shape still has a few known collision points that should be treated as expected housekeeping rather than mysterious runtime failures:

- SSR uses `4000`, so any stale Nest or worker process on that port must be cleared before startup
- the Forge API uses `4101`
- the Forge worker uses `4102`
- the Angular frontend dev server uses `4200`
- Vite HMR may hold `24678`

The current [`scripts/start-all.sh`](/c:/repos/phase-2-cosmic/scripts/start-all.sh) handles these collisions by:

- logging each startup stage explicitly
- clearing stale listeners before launch
- waiting for ports to become free
- appending to a cumulative startup log instead of truncating history

The noisy `Nx ... target serve ... failed` banner can appear when an old frontend dev server is intentionally terminated during cleanup. In that case, the message is from the stale process being stopped, not from the new startup sequence failing.

## Geo collector profile

The regional edge tier lives in `docker/geo-collectors-compose.yml` and is opt-in twice over: it is a separate compose file **and** every service is gated behind the `geo` profile. Normal local development and CI resolve zero geo services.

```bash
docker compose -f docker/dev-compose.yml \
  -f docker/geo-collectors-compose.yml --profile geo up -d
```

It starts three independent regional Pulsar clusters (`us-west`, `eu-central`, `apac-southeast`), a colocated `pulsar-collector` per region forwarding to the single Kafka backbone, and a regional generator per cluster.

Host ports: Pulsar `6651`/`6652`/`6653`, collector metrics `9111`/`9112`/`9113`.

Note the Kafka listener split when connecting from the host: `9092` is the in-network listener and `9093` is host-reachable. A host client using `9092` receives metadata advertising `kafka:9092` and cannot route to it.

**Scoped exception to ADR-003.** ADR-003 requires Pulsar to run as a full profile rather than standalone-only. The core `pulsar` service in `dev-compose.yml` is unchanged and remains a full broker + bookkeeper + zookeeper deployment. The three regional edge clusters run standalone because three full clusters is nine containers, which is not workable on a developer workstation. Standalone here models cluster independence, not production topology; production intent is a full cluster per region.

Tear the stack down with the same file pair and `down` to release the resources.

## Expected next step

Continue evolving the Forge services inside `docker/cosmic-forge-compose.yml` rather than adding Forge runtime to `docker/dev-compose.yml`.

That preserves the branch boundary and keeps Forge adoption explicit.

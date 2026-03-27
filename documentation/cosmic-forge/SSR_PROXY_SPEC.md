# SSR Proxy Specification

Alignment anchors

- Forge architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Forge Docker environment: [./DOCKER_ENVIRONMENT.md](./DOCKER_ENVIRONMENT.md)
- Current local dev baseline: [../overview/GETTING_STARTED.md](../overview/GETTING_STARTED.md)

Status: `planned`

## Why this exists

The current workspace uses a hybrid local-dev model:

- Docker Compose for backend and infrastructure services
- host-side Nest SSR shim for local frontend API routing

Cosmic Forge should fit that model first instead of bypassing it.

## Routing decision

Forge requests should be proxied through the SSR shim during local development.

That keeps the current frontend development workflow coherent and avoids introducing a second, conflicting local API pattern.

## Recommended route shape

Preferred branch-scoped routes:

- `/api/forge/health`
- `/api/forge/graphql`
- `/api/forge/results/*`

Reason:

- avoids collision with current `/api/v1/*` governance routes
- makes branch scope explicit
- lets the UI opt into Forge behavior intentionally

## Local target

Default local target for SSR proxying:

- `http://127.0.0.1:${FORGE_API_HOST_PORT}`

Default host port:

- `4101`

The SSR shim should read this from environment rather than hard-coding it.

## SSR responsibilities

- proxy Forge requests to `cosmic-forge-api`
- provide branch-scoped health visibility
- preserve request/response metrics separately from current governance proxy metrics
- avoid mixing Forge proxy failures into governance status labels

## UI implications

Yes, there should eventually be another view in the UI.

Recommended first new route:

- `/forge`

Recommended initial subviews inside that route:

- workbench
- queue
- results
- provenance

The first implementation does not need all of these as distinct routed pages. A single Forge workbench surface is enough, but the route namespace should be reserved early.

## Suggested implementation steps

1. add Forge base URL env handling to `apps/frontend/server.nest.ts`
2. add proxy handlers for `/api/forge/*`
3. add minimal Forge health probe endpoint consumption in the UI
4. reserve `/forge` route in the Angular shell
5. later attach GraphQL client configuration to the Forge route/module

## Non-goals

- replacing the current governance proxy path
- merging Forge GraphQL into `/api/v1`
- exposing Forge as a hidden implementation detail under existing jobs routes

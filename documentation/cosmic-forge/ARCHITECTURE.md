# Architecture

Alignment anchors

- Current repo architecture: [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
- Existing viewer groundwork: [../viewer/VIEWER_MODEB.md](../viewer/VIEWER_MODEB.md)
- Public-source inventory: [../public-data/PUBLIC_DATA_RESOURCES.md](../public-data/PUBLIC_DATA_RESOURCES.md)
- Docker/local-dev context: [../infra/INFRA_TOPOLOGY.md](../infra/INFRA_TOPOLOGY.md)

Status: `planned`

## Architecture stance

Cosmic Forge is a bounded branch architecture, not current repo-wide truth.

Current repo truth remains:

- Angular frontend
- Nest SSR shim for dev/API proxying
- Java governance/control-plane services
- broker-heavy dev compose environment

Cosmic Forge adds a branch-scoped app family beside that baseline:

- `cosmic-forge-ui`
- `cosmic-forge-api`
- optional `cosmic-forge-worker`

## Context diagram

```mermaid
flowchart LR
  Horizon[Cosmic Horizon<br/>current platform narrative]
  Phase2[phase-2-cosmic<br/>current implementation repo]
  Forge[Cosmic Forge<br/>bounded branch track]
  Viewer[Existing viewer/public-data groundwork]
  Gov[Current Java/OpenAPI governance path]

  Horizon --> Phase2
  Phase2 --> Viewer
  Phase2 --> Gov
  Phase2 --> Forge
  Forge --> Viewer
```

## Runtime flow

```mermaid
flowchart LR
  User[Operator or scientist] --> UI[NgRx workbench UI]
  UI --> GQL[GraphQL API]
  GQL --> Resolve[Target resolution]
  GQL --> Queue[Job orchestration]
  Queue --> Adapters[Public survey adapters]
  Adapters --> Proc[Preview/composite processing]
  Proc --> Store[Artifact and metadata storage]
  Store --> GQL
  Queue --> Subs[GraphQL subscriptions]
  Subs --> UI
```

## Domain model

```mermaid
flowchart TD
  Target[Target]
  Job[Job]
  Survey[Survey]
  Image[Image Product]
  Prov[Provenance Record]
  Viewer[Viewer State]

  Target --> Job
  Survey --> Job
  Job --> Image
  Image --> Prov
  Image --> Viewer
  Target --> Viewer
```

## Phased evolution

```mermaid
flowchart LR
  P1[Phase 1<br/>public cutouts and previews]
  P2[Phase 2<br/>multi-survey products and composites]
  P3[Phase 3<br/>worker hardening and richer provenance]
  P4[Phase 4<br/>optional native image acceleration]
  P5[Later research<br/>raw-data and heavier processing]

  P1 --> P2 --> P3 --> P4 --> P5
```

## Docker environment fit

Cosmic Forge should not be added directly to the default hot path of `docker/dev-compose.yml`.

Recommended local-dev shape:

- keep current compose environment intact
- add a Forge-specific compose file or overlay that runs alongside it
- reuse shared infra where helpful:
  - `minio`
  - `redis`
  - `prometheus`
  - `grafana`
- keep Kafka/Pulsar/RabbitMQ optional for Forge v1
- use the repository root `.env` for local secret loading

## API boundary decision

The current dev workflow routes frontend `/api` traffic through the host-side SSR shim. Forge should respect that local-dev reality instead of inventing a conflicting pattern immediately.

Recommended branch-first approach:

- `cosmic-forge-ui` remains frontend-led
- SSR or a dedicated proxy path forwards Forge requests to `cosmic-forge-api`
- GraphQL is branch-scoped and does not replace the current governance API

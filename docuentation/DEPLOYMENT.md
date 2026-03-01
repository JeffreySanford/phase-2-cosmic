# Deployment & Operational Posture

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)

This document separates current deployment reality from target production architecture.

## 1. Current deployment reality (implemented)

Local development stack:
- Docker Compose services for broker, storage, observability, generator, and Java services
- Angular frontend served via local dev workflow
- governance API in baseline mode (not yet production hardened)

Primary command path:
- `pnpm start:all` (developer workflow)

## 2. Target deployment posture (planned)

Production-oriented shape:
- stateless operational streaming services with horizontal scaling
- stateful governance control plane with durable storage
- segmented network boundaries with explicit API ingress
- policy/audit controls as first-class runtime components

## 3. Environment tiers

### Dev
- permissive defaults for speed
- diagnostics and proxy features available

### Staging
- production-like topology
- hardened auth and policy checks
- full contract and reliability testing

### Production
- strict access control
- minimal exposed debug surfaces
- audited change and incident workflows

## 4. Security controls by tier

Minimum controls to reach staging:
- protected API boundaries
- authN/authZ on governance operations
- restricted diagnostics endpoints
- structured audit events for write actions

## 5. Operational SLO categories

Track these categories:
- API availability and error rate
- orchestration latency and queue depth
- ingestion health and lag
- frontend data freshness and stale-state frequency

## 6. Frontend deployment requirements

- environment badge and freshness indicators enabled
- clear distinction between live and mocked data
- route-level failure and stale-state UX active in production builds

## 7. Release readiness checklist

Before promoting to next tier:
1. `quality:ci` green
2. OpenAPI + fixtures current
3. known security exceptions reviewed
4. frontend jobs workflow validated end-to-end
5. operational dashboards and alerts updated

## 8. Related docs

- [INFRA_TOPOLOGY.md](INFRA_TOPOLOGY.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [TESTING_REQUIREMENTS.md](TESTING_REQUIREMENTS.md)
- [PROGRAM_DIRECTION.md](PROGRAM_DIRECTION.md)

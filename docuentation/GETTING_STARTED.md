# Getting Started — Developer Quickstart

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)


This document is the canonical developer quickstart for the Phase 2 workspace. It explains how to bring up the local infrastructure and start the Angular frontend (dev + SSR) for development.

Prerequisites

- Node.js 20+ (LTS recommended)
- pnpm
- Docker & Docker Compose
- Git

Install repository dependencies

```bash
pnpm install
```

Environment

Create a local `.env` from the sample if you need to override secrets or settings for development:

```bash
cp .env.sample .env
# edit .env as needed (do NOT commit)
```

Dev dependencies for Nest SSR and Vite are already tracked in `package.json`; no extra ad-hoc install step is required for normal development.

Start local infra + frontend

The repo provides a script and two convenient npm scripts. For local development we recommend using the `start:all` script which brings up Docker infra and the frontend in the foreground so logs are visible.

```bash
# Bring up infra and frontend (foreground)
pnpm start:all

# Or run infra only, then start frontend separately
docker compose -f docker/dev-compose.yml up --build -d
pnpm nx serve frontend
```

Verification

- Open `http://localhost:4200` in your browser. The frontend dev server (Vite) with SSR should serve the app.
- Check Docker services with `docker ps` to confirm Kafka, MinIO, Prometheus are running.

Troubleshooting

- If TypeScript complains about missing `@nestjs/*` or `vite` modules, run the dev-only install command above.
- If the frontend shows SSR bootstrap errors (NG05104 or bootstrap type mismatches), ensure `apps/frontend/src/main.server.ts` is in module-mode and the server entrypoint is `apps/frontend/server.nest.ts` in `apps/frontend/project.json`.
- If services fail on startup due to missing Prometheus file, ensure `docker/prometheus.yml` exists in the repo and `docker/dev-compose.yml` mounts it.

Next steps

- See `ENVIRONMENT.md` for rules about `.env` and what gets exposed to the frontend via `/api/env`.
- If you will be contributing UI code, follow the `FRONTEND_UI.md` conventions for theming and component libraries.

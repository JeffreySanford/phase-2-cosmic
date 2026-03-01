# Environment — .env policy and frontend-exposed variables

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)


This document describes the repository's approach to environment variables, secrets, and how the frontend obtains non-sensitive configuration at runtime.

Files

- `docuentation/.env.sample` — canonical sample of env keys (safe to commit)
- `.env` — developer overrides for local development (gitignored; DO NOT COMMIT)

Policy

- Keep secrets (API keys, credentials, signing keys) out of version control. Place secrets only in your local `.env`, or in your CI/CD secret manager.
- Commit only `docuentation/.env.sample` which documents keys, expected formats, and default non-secret values.

Frontend exposure

- The server provides a runtime endpoint `GET /api/env` which returns non-sensitive environment values that the frontend needs at runtime (e.g., feature flags, public URLs, build metadata). Use this endpoint for values that are not secrets.
- The server-side code sources environment variables from `.env` (overlaid on `.env.sample`) when present.

How to add a new exposed variable

1. Add the key and a descriptive default to `docuentation/.env.sample`.
2. If the value is non-sensitive and required in the browser, ensure the server includes the key in the `/api/env` response. Follow the existing server-side list or add to the server env extraction code.
3. If the value is secret, place it only in `.env` and never add it to `/api/env`.

Local development example

```bash
# create local overrides from sample
cp docuentation/.env.sample .env
# edit .env and set any dev secrets
pnpm start:all
```

Notes for reviewers

- When reviewing a PR that adds env keys, ensure `docuentation/.env.sample` is updated with defaults and documentation.
- Ensure sensitive values are not added to the frontend-exposed endpoint.

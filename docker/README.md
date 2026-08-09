# Docker environment

This folder contains Docker artifacts and local development environment helpers.

## Environment-file precedence

The supported startup scripts use the repository-root environment files in this order:

1. `.env` — preferred local/private configuration; gitignored and never committed.
2. `.env.sample` — development fallback when `.env` is absent.

For normal local development, `pnpm start:all` runs `scripts/start-all-local.sh`. That wrapper loads the selected environment file, performs the PostgreSQL local-development preflight, and then launches `scripts/start-all.sh`. `scripts/start-all.sh`, `scripts/cosmic-forge-up.sh`, and the corresponding shutdown script explicitly pass the selected environment file to Docker Compose with `--env-file`.

The Compose files consume variables such as `MINIO_ROOT_PASSWORD` and the Cosmic Forge PostgreSQL component values from the selected environment file. Secret values should not be embedded as Compose fallbacks.

## Cosmic Forge PostgreSQL local contract

The local PostgreSQL sidecar is intentionally a development dependency and is not a public network service.

- Compose binds PostgreSQL to `127.0.0.1` only.
- Startup converges the existing container against the current Compose configuration while preserving the named data volume.
- The wrapper asks Docker for the actual published host port rather than relying only on the configured/default value.
- `scripts/reconcile-forge-postgres.sh` can reconcile the persisted `cosmic_forge` role password without deleting the volume.
- Normal `pnpm start:all` verifies the real host -> Docker authentication path with `node-postgres` before Nest SSR starts.
- If the container-local check succeeds but the host path returns PostgreSQL `28P01`, startup performs one controlled role-password reset through the container-local admin path and retries the host connection.
- The database password is passed to the host process as a credential component and is not embedded in `FORGE_POSTGRES_URL`, so diagnostics must never echo a password-bearing connection URL.

A healthy preflight reports the actual Docker binding and a verified host connection, for example:

```text
[forge-postgres] docker published binding: 127.0.0.1:55432
[forge-postgres] host-side node-postgres connection verified (127.0.0.1:55432/cosmic_forge as cosmic_forge)
```

The port in the message is discovered from Docker and may differ if local configuration changes.

## Manual Compose usage

For direct/manual Compose commands, specify the environment file explicitly when `.env` is not present, for example:

```bash
docker compose --env-file .env.sample -f docker/cosmic-forge-compose.yml up -d
```

Manual Compose commands bypass part of the supported `pnpm start:all` host preflight. Use the normal startup command when validating the complete local application stack.

For normal local development, create `.env` from `.env.sample` and replace development/sample credentials as needed.

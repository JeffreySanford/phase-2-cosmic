# Docker environment

This folder contains Docker artifacts and local development environment helpers.

Setup:

- Copy `docker/.env.sample` to `docker/.env` and adjust values as needed.
- `docker/.env` contains non-secret host port mappings and is intended to be local-only (do not commit).

Compose files in this repo are configured to load `docker/.env` if present.

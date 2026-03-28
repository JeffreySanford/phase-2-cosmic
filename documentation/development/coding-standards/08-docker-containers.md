# 8. Docker & Containers

These standards matter because containers are part of the runtime, not just packaging. Weak Docker
discipline leads to bloated images, root processes, fragile local stacks, inconsistent CI behavior, and
production surprises that somehow always happen on Friday.

## Image construction

- Use multi-stage builds for production images.
- Final images contain only runtime dependencies.
- Run as non-root unless approved exception.
- Pin minimal base images to explicit versions.

## Container runtime behavior

- Define a healthcheck or expose a health endpoint.
- Fail fast on invalid startup configuration.
- Write logs to stdout/stderr; avoid file-based logs inside container.
- Explicit persistent data mounts; do not rely on ephemeral paths.

## Compose & local dev

- `docker/dev-compose.yml` services have stable names, documented ports, deterministic startup.
- Distinguish required services from optional dev conveniences.
- Local scripts should support partial stack startup.

---

### Checklist

- [ ] All Dockerfiles multi-stage and pin base images
- [ ] Healthchecks defined for every service container
- [ ] Non-root user configured where feasible
- [ ] Dev-compose file annotated with required vs optional services

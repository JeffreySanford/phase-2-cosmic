# Java Provenance (docker/java-provenance)

This folder holds Docker artifacts for the Java Provenance/Provenance-related image. It is an organizational placeholder showing that provenance components are packaged as container images alongside other `docker/` assets.

Contents you may add here:

- `Dockerfile` (multi-stage build for the provenance image)
- `compose-snippet.yml` (service snippet to include in `docker/dev-compose.yml`)
- `config/` (runtime config or application properties)

Example `compose-snippet.yml` (use as reference in `docker/dev-compose.yml`):

```yaml
  java-provenance:
    image: phase2/java-provenance:dev
    ports:
      - "8090:8080"
    environment:
      - SPRING_REDIS_HOST=redis
      - SPRING_REDIS_PORT=6379
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 10s
      timeout: 5s
      retries: 5
```

Add a Dockerfile or configuration here if you intend to build the provenance image from this repository; otherwise use the published image `phase2/java-provenance`.

# Maven Test Image

This folder contains a small Dockerfile used to build a reproducible Maven + JDK image
for running unit tests in CI and locally.

Image: `phase2/maven-test:17`

Build locally (requires Docker):

```bash
docker build -t phase2/maven-test:17 tools/maven-test-image
```

Using NX:

```bash
pnpm nx run maven-test-image:build
pnpm nx run maven-test-image:push # optional, requires registry login
```

CI: There is a GitHub Actions workflow `.github/workflows/build-maven-test-image.yml`
that builds and pushes this image to Docker Hub and GHCR when configured.

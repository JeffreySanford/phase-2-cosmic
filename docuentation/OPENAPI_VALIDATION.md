# OpenAPI Validation — Developer Guide

This document explains how to update the OpenAPI spec and validate it locally, matching the CI "OpenAPI Validate" job.

Why: the repo enforces an OpenAPI spec validation gate. CI runs validation when files under `openapi/**` or `docuentation/**` change and will fail the PR if validation fails. Validation includes parsing the OpenAPI YAML and validating checked-in fixtures against schemas.

Files involved

- `openapi/governance.yaml` — canonical OpenAPI document served by the backend.
- `tools/validate-openapi.mjs` — validation script (uses `@apidevtools/swagger-parser` and `ajv`).
- `schemas/fixtures/*.json` — example JSON fixtures validated against schemas in the OpenAPI document.

Run validation locally

1. Ensure project dependencies are installed (pnpm):

```bash
pnpm install --frozen-lockfile
```

1. Run the validation script (same command used in CI):

```bash
pnpm run openapi-validate
```

- The command will exit with a non-zero status if validation fails and print errors to the console.

Run validation with output capture (recommended for debugging)

```bash
mkdir -p validation-output
pnpm run openapi-validate > validation-output/openapi-validate.log 2>&1 || true
# inspect the log
less validation-output/openapi-validate.log
```

How to update the spec safely

1. Edit `openapi/governance.yaml` and keep changes small and schema-driven.
2. Update or add fixtures under `schemas/fixtures/` if the schema changes.
3. Run `pnpm run openapi-validate` locally until it passes.
4. Commit both the spec and any fixture/schema updates together so CI can validate them in the same PR.

CI behavior

- The CI job `OpenAPI Validate` runs only when files under `openapi/**` or `docuentation/**` change.
- The job captures stdout/stderr to `openapi-validation-logs` artifact and fails the build on validation errors.

If CI fails

- Download the `openapi-validation-logs` artifact from the failing workflow run to inspect the full validation output.
- Reproduce locally using the commands above, fix the spec or fixtures, and push an updated commit.

Contact

If you run into validation failures that are unclear, open a PR and request review from the API owners.

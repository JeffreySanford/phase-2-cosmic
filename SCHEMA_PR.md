# Starter Schema Pull Request

This document contains guidance for the initial schema PR referenced in the PI plan.

## Purpose

Provide a minimal example of adding one of the Trident JSON Schemas and wiring it into the
`SchemaService` so that reviewers can see the pattern before broader schema work begins.

## Steps

1. Create a new JSON schema under `openapi/schemas/trident/`, e.g. `trident.example.json`.
2. Add a Maven/Gradle resource entry or TypeScript import as appropriate so the schema is loaded
   by `SchemaService` at runtime. See existing schemas in `apps/java-governance/src/main/resources/schemas` for examples.
3. Add a corresponding Java record (or TypeScript interface) to `apps/java-governance` and/or
   `apps/frontend`.
4. Add a unit test exercising `SchemaService.resolve("/trident.example.json")` and verifying
   it matches the stored schema structure.
5. Update any OpenAPI fragments (`openapi/governance.yaml`) if the schema will be referenced
   by an API payload.
6. Run `pnpm run openapi-validate` to ensure the schema is syntactically correct.

## PR Checklist

- [ ] Schema file added and validated
- [ ] SchemaService registration unit test passes
- [ ] Java/TS type created (optional for backend/ frontend demonstration)
- [ ] OpenAPI fragment updated (if applicable)
- [ ] `openapi-validate` and existing tests all pass
- [ ] PR description references this guidance

Once the example PR is merged, subsequent schema additions can follow the same pattern and
won't require detailed explanations in each review.

# Pull Request Checklist

Before requesting review, make sure your changes satisfy the repository standards.

- [ ] Code compiles and tests pass (`pnpm nx test`, `mvn verify`, etc.)
- [ ] Lint and static analysis run locally (`pnpm run quality:ci`)
- [ ] New public APIs documented with OpenAPI/AsyncAPI or typed DTOs
- [ ] Any cross-project imports go through public API (see coding-standards index)
- [ ] Dependency graph has no cycles (`scripts/check-dep-graph.sh`)
- [ ] Changes are covered by unit tests; integration tests added if needed
- [ ] Documentation updated where applicable (link to `documentation/development/coding-standards`)

See <https://github.com/cosmic-horizon/phase-2-cosmic/blob/main/documentation/development/coding-standards/index.md> for full checklist and rules.

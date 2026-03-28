# 2. Static Analysis & Security Toolchain

Automatic quality gates are essential in a large repository. They reduce human error and provide
immediate feedback on common defects.

The pipeline runs three complementary free/open-source tools on every push/PR:

- **CodeQL** – OWASP/CWE‑focused security SAST for TypeScript, Java, and Go.
- **golangci-lint** – Go linter aggregator used by the Go service(s).
- **Semgrep** – multi-language semantic analysis scanning for patterns (SQLi, hardcoded creds, etc.).

## Additional automated checks

- **Dependency & container scanning** – CI invokes Trivy/Grype against all images and lockfiles;
  high/critical vulnerabilities block merges unless waived with justification and expiry.
- **Secret scanning** – pre-commit hooks and CI examine commits for secrets; examples must be labeled
  and stored in `.example` files.
- **SBOM & provenance** – build pipelines generate SBOMs; production images link back to commit SHA
  and pipeline run.

## Links

- CodeQL workflow: `.github/workflows/codeql.yml`
- ESLint config (module boundaries): `eslint.config.js`
- Dep-graph scan command: `pnpm nx dep-graph --scan`

---

## Checklist

- [ ] CodeQL runs on push/PR (check workflow file)
- [ ] golangci-lint config updated when new Go packages added
- [ ] Semgrep scan included in `test:all`
- [ ] Image scanners configured in CI for every Dockerfile
- [ ] SBOM generation step in release pipeline

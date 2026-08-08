# Resolution Dependency Security Triage

## 1. Purpose

This note captures the dependency-security triage thread that occurred while PR #40 was being hardened.

It is stored in the Resolution package because dependency trust, evidence trust, and future AI trust are connected: a system that explains evidence paths still needs a maintainable software supply chain underneath it.

This document is planning and triage guidance. It does not claim that the vulnerabilities listed by GitHub are fixed by the Resolution documentation package.

## 2. Important interpretation rule

The GitHub banner:

```text
GitHub found 197 vulnerabilities on the default branch
```

does not mean:

```text
PR #40 introduced 197 exploitable runtime flaws.
```

It means GitHub has open dependency alerts for the repository's default branch dependency graph. Those alerts still matter, but they need triage by:

- direct vs transitive dependency,
- production vs development dependency,
- runtime-exposed vs build/test-only package,
- reachable code path vs dormant package,
- patch/minor update vs major coordinated framework upgrade,
- existing Dependabot PR status,
- CI impact,
- lockfile compatibility with the active branch.

## 3. Security triage principles

1. **Do not hand-edit large lockfiles blindly.**
   Prefer package-manager updates or already-open Dependabot PRs that target the vulnerable package family.

2. **Prefer safe patch/minor upgrades before major migrations.**
   Angular, Nx, Storybook, Vite, and SSR packages can be tightly coupled. Patch-level security updates are usually safer than isolated major jumps.

3. **Separate baseline CI instability from dependency regressions.**
   If a Dependabot PR fails because of unrelated baseline CI failures, the patch may still be valid. If tests fail because APIs or build behavior changed, the upgrade needs coordinated remediation.

4. **Track production exposure.**
   A dev-only parser issue in a docs tool is different from an SSR, HTTP client, Java object-store, or runtime server dependency issue.

5. **Add repeatable evidence.**
   Security remediation should leave behind audit output, Dependabot PR references, lockfile changes, CI status, or a documented exception.

6. **Keep secrets and credentials out of remediation commits.**
   Dependency updates must not introduce sample tokens, registry credentials, or fallback secrets.

## 4. Candidate dependency families from the PR #40 triage

The following package families were identified as worth tracking from existing GitHub/Dependabot signals.

| Package family                           | Likely surface                                              | Initial handling                                                                        |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Angular SSR / `@angular/platform-server` | frontend SSR runtime                                        | Prefer coordinated Angular patch update; verify SSR smoke and E2E                       |
| Vite                                     | frontend dev/build tool, SSR-adjacent tooling               | Prefer patch/minor update compatible with Angular/Nx toolchain                          |
| Handlebars                               | templating transitive dependency, often docs/build tooling  | Patch through owning top-level package when possible                                    |
| `fast-uri`                               | URL parsing/validation transitive dependency                | Patch through parent dependency; inspect runtime reachability                           |
| `picomatch`                              | glob matching, build/test tooling                           | Patch via package-manager resolution or parent upgrades                                 |
| `lodash`                                 | broad utility dependency                                    | Prefer direct patch if direct; otherwise parent package upgrade                         |
| `basic-ftp`                              | file-transfer dependency, likely transitive tooling surface | Confirm whether reachable in runtime; patch through parent                              |
| Hono                                     | HTTP/server framework surface if present                    | Runtime-sensitive; patch directly if used                                               |
| Axios                                    | HTTP client                                                 | Runtime-sensitive; patch directly if used                                               |
| MinIO Java                               | object-store client                                         | Runtime-sensitive for storage/object references; patch deliberately and test Java flows |
| `org.json`                               | Java JSON library                                           | Runtime-sensitive when parsing external payloads; patch and run Java governance tests   |

This list is not exhaustive. It is the PR #40 triage seed list.

## 5. Recommended immediate workflow

Use this workflow when returning to dependency remediation:

1. Fetch current default branch and PR branch.
2. List open Dependabot/security PRs and group by ecosystem.
3. For each candidate, record:
   - package,
   - vulnerable version,
   - patched version,
   - direct/transitive status,
   - production/dev scope,
   - existing PR number,
   - CI result,
   - whether the failure is baseline or caused by the dependency update.
4. Apply the smallest safe set of updates to the active branch.
5. Run targeted local validation:
   - frontend lint/build/unit where JS packages changed,
   - SSR/E2E where Angular/Vite/runtime packages changed,
   - Java governance tests where Java dependencies changed.
6. Push only after lockfile/package changes are reproducible.
7. Document unresolved critical/high alerts with an owner, reason, and expiry.

## 6. Suggested evidence table

Future remediation work should maintain a table like this in the PR or a follow-up security document:

| Alert/package               | Ecosystem | Direct/transitive | Runtime exposure   | Proposed fix              | Validation               | Status  |
| --------------------------- | --------- | ----------------- | ------------------ | ------------------------- | ------------------------ | ------- |
| Angular SSR/platform-server | pnpm      | direct            | SSR runtime        | coordinated Angular patch | frontend build + SSR E2E | pending |
| Vite                        | pnpm      | direct/transitive | build/SSR-adjacent | compatible patch/minor    | build + E2E              | pending |
| MinIO Java                  | Maven     | direct            | object storage     | patched Java client       | java-governance verify   | pending |
| `org.json`                  | Maven     | direct            | JSON parsing       | patched Java library      | Java API tests           | pending |

## 7. CI gate direction

The long-term goal should be a security regression gate that is visible in CI and documented when waived.

Candidate gate layers:

- Dependabot alert review for default branch,
- `pnpm audit` or equivalent when registry access is available,
- Maven dependency vulnerability scanning,
- CodeQL for source-level security issues,
- container image vulnerability scan for runtime images,
- explicit exception file for accepted risk.

The gate should distinguish:

- critical/high production-runtime exposure,
- critical/high dev-only exposure,
- lower-severity transitive exposure,
- alerts blocked by upstream packages,
- known false positives or non-reachable tooling paths.

## 8. Relationship to Resolution

Resolution's evidence model should eventually make security posture queryable too.

Possible future graph nodes and edges:

```text
Package -> Dependency -> Vulnerability -> Fix PR -> CI Evidence
Runtime Image -> Contains Package -> Vulnerability
Service -> Uses Package -> Vulnerability Exposure
```

This would let Ask Cosmic answer operational trust questions such as:

- Which services are affected by this vulnerable dependency?
- Which runtime images contain the patched package?
- Which CI evidence proves the fix?
- Which alerts are accepted risk and when do they expire?

That is a future capability, not a PR #40 implementation claim.

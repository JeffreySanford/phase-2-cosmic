# 11. Database & Persistence

These standards matter because persistence decisions outlive most application code. Migration discipline,
query visibility, indexing awareness, and pagination rules prevent data stores from becoming the place where
performance, correctness, and maintainability go to die.

- Apply schema changes through versioned migrations (Flyway, Liquibase).
- Destructive migrations require rollback or remediation planning.
- Consider index strategy when adding new tables/collections.
- Make soft-delete behaviour explicit and consistent.
- Repository/query methods must not hide expensive full scans.
- Always paginate results for potentially unbounded sets.

---

## Checklist

- [ ] Migration scripts accompany every schema change
- [ ] Index decisions recorded in code or migration comments
- [ ] Queries returning lists include explicit limits/offsets or cursors

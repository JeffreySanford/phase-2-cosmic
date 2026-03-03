# Migration Progress

- [⌛️] Add test-only simulator executor
- [✅] Create progress file & preview
- [ ] Run `mvn -f apps/java-governance test`
- [ ] Fix remaining test failures
- [ ] Commit and push changes

## Notes
- Working on adding a simulator executor to `JobServiceRecoverTest` so queued jobs transition to `RUNNING` in unit tests without Docker/Testcontainers.

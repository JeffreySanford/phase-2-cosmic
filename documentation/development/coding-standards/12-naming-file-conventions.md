# 12. Naming & File Conventions

These standards matter because naming is architecture in plain English. Good names reduce cognitive load,
reveal intent, and make systems easier to navigate. Bad names create confusion that no amount of clever
code can undo.

- Names must reflect business meaning, not implementation accidents.
- Avoid vague names such as `data`, `info`, `manager`, `helper`, `processor`, or `misc` unless the
  scope is extremely obvious.
- Event names: past‑tense for facts, imperative for commands. Do not mix the two casually.
- Filenames, package names, library names, queue names, and topic names should follow a documented
  convention consistent across the repo.

---

## Checklist

- [ ] New packages/components are given descriptive, business‑oriented names
- [ ] Message/event names follow the past‑tense/imperative rule
- [ ] File and queue names adhere to the repository naming convention

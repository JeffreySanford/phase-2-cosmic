# 6. Python

Python is great for tooling and data pipelines, but quick scripts can turn into opaque production
dependencies. These rules make accidental permanence harder.

## Project structure

```text
tools/<service>/
  src/<package>/
    __init__.py
    main.py           # entry point/CLI
  tests/             # mirror src structure
    test_<module>.py
  pyproject.toml
  requirements.lock
```

## Package management

- Use `pip`/`pyproject.toml`; pin transitive deps in `requirements.lock` via `pip-compile`.
- Do not commit `.venv` or `__pycache__`.
- Document env creation steps in README.

## Type hints

- All public APIs must be annotated.
- Use `from __future__ import annotations`.
- Run `mypy --strict` in CI.

## Formatting & linting

- Format with `black` (100‑char).
- Sort imports with `isort` (black profile).
- Lint with `ruff`; treat findings as failures.

## Naming

- `snake_case` for vars/functions/modules; `PascalCase` for classes; `UPPER_SNAKE_CASE` for constants.
- Private names start with `_`.

## Code style

- Structured data via `dataclasses`/`pydantic`; avoid raw dicts >2 fields.
- Absolute imports only; no relative imports outside `__init__.py`.
- Keep modules <300 lines.

## Error handling

- Catch specific exceptions. Bare `except:` only at top-level with logging.
- Use custom exception hierarchy for domain errors.
- Log full exception with `log.exception()`.

## Logging

- Configure logging once in entry point.
- No `print()` in production code.

## Testing

- Use `pytest` with `pytest-cov` (80%+ coverage).
- Use `@pytest.mark.parametrize` for tables.
- Mock I/O with `unittest.mock`/`pytest-mock`.
- Integration tests marked `@pytest.mark.integration`.

---

### Checklist

- [ ] `mypy`, `black`, `ruff`, and `isort` run in CI
- [ ] Scripts promoted to packages have tests and type hints
- [ ] `requirements.lock` updated with `pip-compile`

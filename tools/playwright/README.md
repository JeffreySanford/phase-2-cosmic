# Playwright e2e tests (minimal scaffold)

Requirements:

- Node.js installed
- From the repo root, install Playwright (this will also install browser binaries):

```bash
# from repo root
pnpm add -D @playwright/test
npx playwright install --with-deps
```

Run tests:

```bash
# from repo root
npx playwright test --config=tools/playwright/playwright.config.ts
```

The tests expect the frontend dev server to be running at <http://localhost:4200> (use `pnpm nx serve frontend` in another terminal).

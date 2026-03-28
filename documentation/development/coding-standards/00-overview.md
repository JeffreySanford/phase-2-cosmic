# Coding Standards v2 Overview

This folder contains the **Version 2** rewrite of the repository coding standards. The goal of v2
is to transform the single long document into a modular handbook that is easier to navigate,
enforce, and extend.

Each topic appears in its own file; the master `index.md` (below) provides links and a quick
checklist for reviewers. Wherever rules are automatically checked by lint, Nx, or CI scripts the
section includes a pointer to the relevant config or command, and enforcement scripts (e.g.
`scripts/check-dep-graph.sh`) are referenced where appropriate.

> **Styling note:** the companion `asides.css` file contains simple rules for `<aside>` callouts
> (used for sidebar paragraphs) should the markdown be rendered by a static site generator.

## Why separate documents?

- **Discoverability** – engineers can jump straight to the area they care about without scrolling.
- **Maintainability** – small files are simpler to review and update; sections can be reclaimed by
  language owners.
- **Automation** – rules codified in tooling are linked inline so the doc stays in sync with the
  pipeline.
- **Checklists & templates** – each topic ends with a lightweight checklist that can be pasted into
  a PR description.

> **Reminder:** the original `CODING-STANDARDS.md` file has been retained in the repository root as
> v1 compatibility but should not be updated going forward. New work belongs in the `coding-standards`
> folder.

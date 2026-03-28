# First Adapter Decision

Alignment anchors

- Data source comparison: [./DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md)
- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Public-data readiness: [./PUBLIC_DATA_READINESS.md](./PUBLIC_DATA_READINESS.md)

Status: `planned`

## Decision

Cosmic Forge should implement `Legacy Surveys / NOIRLab` as the first production adapter.

`IRSA` should be the second adapter family in the same PI if Sprint 5 and Sprint 6 complete cleanly.

## Why this is the right first choice

### Best fit for the first visible product win

Cosmic Forge needs an early adapter that makes the `/forge` workbench feel real quickly:

- clear visual output
- direct cutout utility
- easy preview inspection
- fast operator feedback

Legacy Surveys is the strongest match for that first visible outcome.

### Strongest alignment with the current Forge UX

The current Forge concept is centered on:

- target entry
- survey selection
- cutout request
- preview inspection
- provenance-rich result review

Legacy Surveys supports that flow naturally because it is already very viewer-friendly and cutout-oriented.

### Lower ambiguity for the first adapter

IRSA is a strong long-term archive family, but it introduces more collection-level decision-making early:

- which mission first
- which endpoint pattern first
- which output conventions first

That is useful later, but it adds decision surface area before the first end-to-end win exists.

Legacy Surveys is narrower, which is an advantage for Adapter 1.

### Strong visual payoff for demos and operator workflows

The first adapter should help prove:

- the queue lifecycle
- artifact generation
- preview display
- source attribution

Legacy Surveys is especially good for that because the first output is likely to look useful immediately in the Forge UI.

## Why IRSA is second, not first

IRSA is still a high-priority source and arguably the strongest long-term archive/API foundation.

It is second rather than first because:

- the first PI needs one fast, convincing, low-ambiguity cutout success path
- the first adapter should minimize upfront branching in collection selection
- IRSA is better treated as the second adapter family once the adapter abstraction is proven

That makes the sequence:

1. `Legacy Surveys / NOIRLab`
2. `IRSA`
3. `SkyView` and `ESASky` as discovery/preview enrichment
4. `Pan-STARRS` as an additional optical comparison/archive path

## Decision consequences

### What this means for Sprint 5

- implement the first real adapter against Legacy Surveys / NOIRLab
- optimize the first result path for preview success and provenance completeness
- keep the adapter abstraction broad enough that IRSA can plug in next without refactoring the whole stack

### What this means for provenance

The first adapter implementation should capture:

- requested target or coordinates
- selected survey layer or band set
- cutout size and scale parameters
- authoritative source URL
- retrieval timestamp
- output format and artifact mode
- any transformation steps used to create the preview artifact

### What this means for UI messaging

The Forge UI should explicitly show that the first production-backed source is Legacy Surveys / NOIRLab.

That keeps the first release honest and avoids implying broader mission support than actually exists.

## Recommended immediate next steps

- [ ] Mark Legacy Surveys / NOIRLab as the chosen first production adapter in `PI_EXECUTION_PLAN.md`.
- [ ] Mark IRSA as the chosen second adapter family in `PI_EXECUTION_PLAN.md`.
- [ ] Add a Legacy Surveys adapter design subsection to the implementation work for Sprint 5.
- [ ] Define the exact request parameters Forge will support in the first adapter.
- [ ] Define the exact provenance fields that must be stored for each Legacy Surveys result.
- [ ] Add one deterministic mock fixture that mirrors the first real Legacy Surveys output shape.
- [ ] Add one acceptance test that proves a real Legacy Surveys-backed preview can be requested and displayed.

## Official references

- [Legacy Surveys viewer](https://www.legacysurvey.org/viewer)
- [NOIRLab Data Lab Legacy Surveys](https://datalab.noirlab.edu/data/legacy-surveys)
- [NOIRLab image cutout documentation](https://datalab.noirlab.edu/docs/manual/UsingAstroDataLab/WebPortal/DataExplorer/ImageSearchCutout/ImageSearchCutout.html)
- [IRSA Image APIs](https://irsa.ipac.caltech.edu/docs/program_interface/api_images.html)
- [IRSA cutouts application](https://irsa.ipac.caltech.edu/applications/Cutouts/)
- [IRSA image cutout service](https://irsa.ipac.caltech.edu/ibe/cutouts.html)

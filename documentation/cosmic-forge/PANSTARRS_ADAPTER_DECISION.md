# Pan-STARRS Adapter Decision

Alignment anchors

- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Data source comparison matrix: [./DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md)
- First adapter decision: [./FIRST_ADAPTER_DECISION.md](./FIRST_ADAPTER_DECISION.md)

Status: `implemented_as_follow_on`

## Decision

`Pan-STARRS / STScI` should be treated as a follow-on optical adapter and comparison source, not as the first-wave adapter that displaces `Legacy Surveys / NOIRLab`.

Current branch note:

- the recommendation to keep `Legacy` as the primary optical adapter remains intact
- the branch has since gone further and now includes a live `Pan-STARRS` archive-native comparison adapter without changing that primary decision

## Why this is the right role

Pan-STARRS is strong where Forge needs:

- an additional public optical cutout source
- a comparison path against Legacy Surveys for the same targets
- scriptable filter-aware image retrieval through a public archive service
- an archive-native optical source with explicit STScI/MAST provenance

Pan-STARRS is weaker as an immediate PI-priority adapter because:

- Legacy Surveys is already the chosen first production optical adapter
- much of the first-wave operator value is already covered by the Legacy slice
- Pan-STARRS is therefore more useful as validation, comparison, and follow-on coverage than as a competing first-wave foundation

## Evidence from the official STScI documentation

- The PS1 image cutout service supports position-based retrieval using `ra` and `dec` as well as object-name lookup.
- The default cutout returns `240x240` pixels, equivalent to about `1x1` arcminute at the documented PS1 scale of `0.25 arcsec/pixel`.
- The service exposes the `grizy` filters and can also generate color images from the stack products.
- The broader PS1 documentation provides explicit archive help and acknowledgement text, which is a good fit for result-level provenance and citation handling in Forge.

## Ergonomics comparison with Legacy Surveys

### Where Pan-STARRS is attractive

- strong public optical cutout path with clear filter selection
- explicit stack and color-image affordances
- useful archive-native comparison source for the same target/operator request

### Where Legacy remains the first PI choice

- Legacy is already implemented and stable in Forge
- Legacy is the simpler first-wave operational path already chosen for the PI
- Pan-STARRS overlaps enough with Legacy that adding it now would broaden the optical surface more than it would unblock a missing capability

The implementation recommendation follows from that overlap: keep `Legacy` as the primary optical adapter in the PI and add `Pan-STARRS` afterward as an optical comparison/archive extension. That is now the implemented branch posture.

## Product posture for Forge

Use Pan-STARRS for:

- optical comparison against Legacy Surveys
- public archive-native optical cutouts after the Legacy slice is stable
- optional operator workflows where PS1 filter selection or color-image behavior is useful

Do not use Pan-STARRS as:

- a replacement for the first-wave Legacy adapter
- a reason to reopen the PI-first optical adapter decision

## Provenance and citation requirements

If adopted, Pan-STARRS-backed results should capture at least:

- provider name: `STScI / MAST Pan-STARRS`
- survey identifier: `ps1`
- requested target name if provided
- resolved `ra` / `dec`
- cutout width and height in pixels
- pixel scale
- requested filters
- product type such as `stack`, `warp`, or `color`
- output format such as `jpg`, `png`, or `fits`
- authoritative request URL
- access timestamp
- transform chain used by Forge
- citation or acknowledgement text source reference

Forge should also preserve the official STScI acknowledgement path in result metadata rather than collapsing it into a generic platform citation.

## Recommended implementation posture

- keep Pan-STARRS out of the first-wave primary adapter decision
- add it after Legacy and IRSA are stable
- implement it as an archive-native optical adapter, not a derived preview adapter
- use it for comparison testing on the same targets and geometry that Forge already uses for Legacy

## Recommended Forge wording

Use wording like:

- `Pan-STARRS archive cutout`
- `PS1 optical comparison`
- `STScI / MAST source asset`

Avoid wording that implies:

- it is the preferred first-wave optical source
- it supersedes the Legacy decision already made for this PI

## Official references

- Pan-STARRS archive overview: https://outerspace.stsci.edu/display/PANSTARRS/
- How to retrieve and use PS1 data: https://outerspace.stsci.edu/display/PANSTARRS/How%2Bto%2Bretrieve%2Band%2Buse%2BPS1%2Bdata
- PS1 Image Cutout Service: https://outerspace.stsci.edu/display/PANSTARRS/PS1%2BImage%2BCutout%2BService

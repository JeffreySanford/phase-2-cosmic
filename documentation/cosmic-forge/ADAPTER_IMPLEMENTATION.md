# Adapter Implementation Notes (Cosmic Forge)

This document consolidates key implementation guidance for adapter work from multiple prior files.

## 1. Legacy Surveys / NOIRLab (first adapter)

- Implement early visible cutout and preview path.
- Required query flow:
  - target or RA/Dec + size
  - survey/layer selection
  - cutout request -> preview URL + provenance.
- Required provenance fields:
  - provider name
  - source survey/layer
  - target name / ra/dec
  - bands, pixscale, size
  - authority URL + access timestamp
  - artifact mode + transform chain.

## 2. IRSA / AllWISE (second adapter family)

- First target inside IRSA: AllWISE.
- Use SIA v2 discovery + IBE cutout retrieval.
- Keep adapter contract generic for later 2MASS.
- Required request model:
  - target name/RA/Dec, size, collection, band
- Required result model:
  - product id/job id
  - provider, mission family, collection, band
  - preview URL, source URL, artifact mode, access time
- Required provenance:
  - IRSA provider, collection, mission family
  - requested geometry and band
  - retrieval path and archive metadata
  - DOI/citation.

## 3. SkyView (fallback/comparison)

- Add post-Legacy+IRSA, as derived preview path.
- Include transform chain `skyview-derived-image`.
- Keep provenance separate from archive-native.

## 4. ESASky (discovery/HiPS preview)

- Add as preview/discovery provider.
- Distinguish `esasky-derived-preview` vs `esasky-mission-download`.
- Use when HiPS or broad mission coverage is desired.

## 5. Pan-STARRS (follow-on optical comparison)

- Add as comparison optical source after first adapter path.
- Show provider name and fields as STScI/MAST.
- Keep common queue + context model with Legacy.

## 6. Shared implementation requirements

- Adapter interface should support:
  - resolveAvailability
  - discoverImages
  - selectBestImage
  - buildCutoutRequest
  - fetchPreviewArtifact
  - buildProvenance
- Do not mix queue scheduling semantics into adapter code.
- Keep worker as generic provider path adapter in shared queue.
- Ensure GraphQL and NgRx models remain stable:
  - add provider fields without breaking existing flows.

## 7. Post-PI cleanup guidance

- Move retired decision/internal notes into `archive/`.
- Keep core plans and architecture docs in place.
- Keep template from legacy decision docs in a consolidated form.

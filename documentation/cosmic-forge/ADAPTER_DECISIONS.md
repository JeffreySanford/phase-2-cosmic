# Adapter Decisions (Cosmic Forge)

This consolidated decision document replaces the previous individual adapter decision files.

## 1. First production adapter

- Chosen: Legacy Surveys / NOIRLab.
- Rationale:
  - Fastest product win and simplest production path.
  - Strong visual output, preview workflow, and provenance.
  - Limited ambiguity for first PI behavior.
- Consequence:
  - Preserve first-wave focus on this adapter (single stable path).
  - IRSA is second-family follow-on.

## 2. Second adapter family

- Chosen: NASA/IPAC IRSA.
- First IRSA subtarget: AllWISE.
- Second IRSA subtarget: 2MASS as follow-on.
- Rationale:
  - IRSA adds official archive capability and IR context.
  - AllWISE best complements Legacy optical path with mid-IR.
  - 2MASS added after shared IRSA contract is stable.

## 3. SkyView role

- Role: fallback/comparison adapter (derived-preview, not first-wave archive-native).
- Rationale:
  - Good for multi-survey discovery, cross-survey comparisons, quick-look generated imagery.
  - Not used as authoritative archive-native cutout source.
- Provenance: `skyview-derived-image` marker and distinct contract.

## 4. ESASky role

- Role: discovery + HiPS preview adapter (visualization-oriented, not primary archive-native data).
- Rationale:
  - Good for mission-breadth and HiPS exploration.
  - Not a replacement for archive-native cutouts (Legacy/IRSA).
- Provenance: `esasky-derived-preview` vs mission-grade `esasky-mission-download` distinction.

## 5. Pan-STARRS role

- Role: follow-on optical comparison adapter (after Legacy + IRSA).
- Status: implemented as follow-on after first-wave Legacy.
- Rationale:
  - Added optical comparison source, not PI first-wave driver.

## Implementation commitments that survived PI

- Keep provensance mandatory for every adapter.
- Use the same queue model, effect semantics, and artifact shape across providers.
- Keep initial adapter paths minimal and only broaden after first vertical slice.

## Reference anchors

- PI execution plan: [PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Product blueprint: [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Implementation plan: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

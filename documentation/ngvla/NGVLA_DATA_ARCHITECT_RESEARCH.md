# ngVLA Data Architect Research Traceability

Date: 2026-03-03  
Scope: external source review used to refine `TODO.md` section `5D` and `ROADMAP.md` Phase 6.

## Sources Reviewed

1. NRAO Data Architect job posting (Req #109), posted 2026-02-11 and expiring 2026-04-02.

   - URL: https://careers.nrao.edu/jobs/16508875-data-architect
   - Relevance: defines expected responsibilities for data modeling, ETL design, data quality, security, and metadata governance.

2. ngVLA Project Book 2024.

   - URL: https://ngvla.nrao.edu/public/24A-154_Introduction_to_the_ngVLA_Project_Book_2024.pdf
   - Relevance: confirms CSS architecture responsibilities across operations, computing, and archive delivery.

3. ngVLA Memo #11 (Computing, Data Rates and Computational Loads), November 2024.

   - URL: https://ngvlac.nrao.edu/page/memos
   - Relevance: motivates queue-aware ingestion, buffering policy, and throughput-focused observability.

4. ngVLA Memo #12 (Computing, Queueing and Buffering), November 2024.

   - URL: https://ngvlac.nrao.edu/page/memos
   - Relevance: motivates explicit backlog/reprocessing budgets and controlled ingestion behavior under burst conditions.

5. NRAO ngVLA FAQ (updated 2025-04-08).

   - URL: https://ngvla.nrao.edu/page/faq
   - Relevance: emphasizes calibrated visibilities and science-ready products as external-facing outputs.

6. IVOA Provenance Data Model Recommendation (2023-11-04).

   - URL: https://www.ivoa.net/documents/ProvenanceDM/
   - Relevance: provides interoperable lineage concepts (`Entity`, `Activity`, `Agent`) for astronomy data pipelines.

7. IVOA Observation Data Model Core Components.
   - URL: https://www.ivoa.net/documents/ObsCore/index.html
   - Relevance: informs interoperable catalog fields for query/discovery (`s_ra`, `s_dec`, `t_min`, `t_max`, `em_min`, `em_max`, `calib_level`, `dataproduct_type`).

## What Changed in Planning

- Added queue-aware ingest controls and reprocessing budget tasks to `TODO.md` (`DA-9`) and Phase 6 sprint deliverables.
- Added ObsCore-aligned metadata interoperability tasks to `TODO.md` (`DA-10`) and Phase 6 sprint deliverables.
- Added science-ready product publication/access-policy tasks to `TODO.md` (`DA-11`) and Phase 6 sprint deliverables.
- Added explicit external evidence anchors in `ROADMAP.md` Phase 6 for design-review traceability.

## Scope Guidance

- Near-term scope should remain:
  - manifest schema + lineage persistence
  - queryable catalog filters
  - queue telemetry + controlled degradation
  - RBAC and audit-ready access policy
- Longer-term scope can evaluate:
  - graph-native lineage backend
  - stronger FTS/spatial search backend
  - advanced data-lake table formats for archive optimization

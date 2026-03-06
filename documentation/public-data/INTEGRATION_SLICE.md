# Public Data Integration Slice

This document defines the implementation plan for the public-data integration slice, focusing on NRAO TAP metadata ingest, viewer seed imagery, and source attribution fields.

## Overview

The public-data integration slice aims to demonstrate end-to-end ingestion and visualization of public astronomical data sources, specifically targeting NRAO resources for realistic demo and testing scenarios.

## Components

### 1. NRAO TAP Metadata Ingest

**Objective**: Implement automated ingestion of NRAO archive metadata via the Table Access Protocol (TAP) service.

**Requirements**:

- TAP client implementation for querying `data-query.nrao.edu/tap`
- Metadata mapping to internal dataset/manifest schema
- Scheduled ETL pipeline for incremental updates
- Error handling for API rate limits and service outages

**Implementation Plan**:

- Add TAP client library (pyVO or similar) to data ingestion pipeline
- Create TAP query templates for common metadata fields
- Implement incremental sync based on observation dates
- Add TAP health monitoring to diagnostics

**Success Criteria**:

- Successfully ingest metadata for at least 100 NRAO observations
- Metadata includes RA/Dec, frequency, observation date, and instrument info
- Ingest process runs without manual intervention

### 2. Viewer Seed Imagery

**Objective**: Integrate public NRAO/VLASS imagery as seed data for the Aladin viewer.

**Requirements**:

- VLASS HiPS imagery integration (`vlass-dl.nrao.edu`)
- Automatic fallback to public imagery when local data unavailable
- Source attribution display in viewer UI
- Progressive loading for large sky areas

**Implementation Plan**:

- Extend viewer component to accept external HiPS URLs
- Add NRAO VLASS as default fallback survey
- Implement source citation overlay in viewer
- Add imagery loading progress indicators

**Success Criteria**:

- Viewer displays VLASS imagery by default
- Source attribution shows "VLASS Survey, NRAO" in viewer
- Imagery loads within 5 seconds for typical field sizes

### 3. Source Attribution Fields

**Objective**: Implement comprehensive source attribution for all externally sourced data.

**Requirements**:

- Database schema extension for source metadata
- UI components for displaying source information
- API endpoints for source registry management
- Citation formatting for different source types

**Implementation Plan**:

- Extend dataset schema with source attribution fields
- Add source registry API endpoints
- Create UI components for source display
- Implement citation formatting logic

**Success Criteria**:

- All datasets show authoritative source information
- Source citations include URLs and proper formatting
- UI gracefully handles missing attribution data

## Implementation Priority

1. **Phase 1**: Basic TAP client and metadata ingest (2 weeks)
2. **Phase 2**: Viewer seed imagery integration (1 week)
3. **Phase 3**: Source attribution fields and UI (2 weeks)
4. **Phase 4**: End-to-end testing and refinement (1 week)

## Dependencies

- Java ingest service for TAP client
- Frontend viewer component for imagery integration
- Database schema for source attribution
- API contracts for source registry

## Testing

- Unit tests for TAP client functionality
- Integration tests for metadata ingest pipeline
- E2E tests for viewer imagery loading
- UI tests for source attribution display

## Success Metrics

- TAP ingest processes 1000+ observations successfully
- Viewer loads public imagery in <5 seconds
- 100% of datasets display proper source attribution
- Zero data quality issues from external sources

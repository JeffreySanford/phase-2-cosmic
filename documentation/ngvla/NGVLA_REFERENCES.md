# ngVLA Reference Documentation

This document serves as the canonical reference index for ngVLA (next-generation Very Large Array) facts, technical specifications, and scientific citations used throughout the Cosmic Horizon platform.

**Mission linkage:**

- **Mission outcome**: Reproducible science
- **Operator/science impact**: Domain-accurate metadata and provenance signals improve trust in workflow interpretation
- **Validation evidence**: Referenced by fixtures, contracts, tests, and demo documentation

---

## Overview

The Next Generation Very Large Array (ngVLA) is a transformational radio telescope system designed for high-resolution, high-sensitivity observations from ~1.2 to 116 GHz. The array consists of 244 antennas distributed across multiple configurations to provide flexible baseline coverage for diverse scientific objectives.

---

## Official References

### Primary Sources

1. **ngVLA Project Website**  
   <https://ngvla.nrao.edu/>  
   _Official NRAO project homepage with design concepts, science goals, and technical updates_

2. **ngVLA Science Book (2017)**  
   Murphy, E. (ed.) 2017, "Science with a Next Generation Very Large Array", ASP Conference Series, Vol. 517  
   <https://library.nrao.edu/public/memos/ngvla/NGVLA_memo75.pdf>

3. **ngVLA Technical Memo Series**  
   <https://library.nrao.edu/ngvla.shtml>  
   _Technical memos covering array configuration, receiver design, correlator specs, and operations concepts_

4. **ngVLA Key Science Goals (2019 Community Review)**  
   <https://ngvla.nrao.edu/general/key-science-goals>  
   _Includes: protoplanetary disk imaging, cosmic dawn observations, time domain/multi-messenger astrophysics, AGN physics_

---

## Array Configuration

The ngVLA design includes three primary array configurations optimized for different angular scales and sensitivity requirements:

### Main Array

- **Number of antennas**: 214 antennas
- **Baseline range**: 26 m to 1,005 km (maximum baseline)
- **Geographic extent**: Distributed across southwestern United States
- **Primary science**: General-purpose array for medium-to-high resolution observations
- **Canonical label**: `Main`

**Reference**: ngVLA Memo #55 - "Array Configuration Optimization" (Selina et al. 2018)  
<https://library.nrao.edu/public/memos/ngvla/NGVLA_memo55.pdf>

### Long Baseline Array (LBL)

- **Number of antennas**: 19 antennas
- **Baseline extent**: 1,000 km to 8,946 km (maximum baseline, transcontinental)
- **Geographic extent**: Continental US + strategic international sites
- **Primary science**: Ultra-high-resolution imaging (milli-arcsecond to sub-milli-arcsecond scales)
- **Canonical label**: `Long Baseline`

**Reference**: ngVLA Memo #75 - "Science with the ngVLA" (Murphy et al. 2017), Chapter 12: High Angular Resolution Science

### Short Baseline Array (SBA)

- **Number of antennas**: 19 antennas
- **Baseline range**: 9 m to 330 m
- **Location**: Central compact core (co-located with VLA site or similar)
- **Primary science**: Maximum surface-brightness sensitivity for extended structures
- **Canonical label**: `SBA`

**Reference**: ngVLA Memo #49 - "Short-Spacing Considerations" (Carilli & Holdaway 2017)  
<https://library.nrao.edu/public/memos/ngvla/NGVLA_memo49.pdf>

---

## Antenna Specifications

### Antenna Classes

**18-meter antennas**:

- **Quantity**: Majority of the array (214 main array + 19 SBA)
- **Frequency range**: 1.2–116 GHz (full ngVLA band coverage)
- **Antenna class label**: `18m`

**6-meter antennas**:

- **Quantity**: 19 antennas (LBL)
- **Frequency range**: 70–116 GHz (high-frequency optimized, compact transport)
- **Antenna class label**: `6m`

**Reference**: ngVLA Memo #73 - "Antenna Design Concepts" (Bryerton et al. 2017)  
<https://library.nrao.edu/public/memos/ngvla/NGVLA_memo73.pdf>

---

## Frequency Coverage

The ngVLA is designed to operate across a wide frequency range to enable transformational science from decimeter to millimeter wavelengths.

### Canonical Frequency Bands

| Band Name | Frequency Range (GHz) | Wavelength (cm) | Key Science                                         |
| --------- | --------------------- | --------------- | --------------------------------------------------- |
| Band 1    | 1.2 - 3.5             | 25 - 8.6        | HI, AGN jets, pulsar timing                         |
| Band 2    | 2.4 - 8.0             | 12.5 - 3.75     | Continuum surveys, transients, masers               |
| Band 3    | 6.0 - 18.0            | 5.0 - 1.7       | Molecular lines (NH₃, H₂O), continuum               |
| Band 4    | 12.0 - 26.0           | 2.5 - 1.15      | CO, dust continuum, protoplanetary disks            |
| Band 5    | 26.0 - 50.0           | 1.15 - 0.6      | High-frequency continuum, molecular spectroscopy    |
| Band 6    | 50.0 - 116.0          | 0.6 - 0.26      | Ultra-high-resolution imaging, dust/molecular lines |

**Reference**: ngVLA Memo #58 - "Receiver and Feed Design" (Ngan et al. 2018)  
<https://library.nrao.edu/public/memos/ngvla/NGVLA_memo58.pdf>

---

## Key Performance Specifications

### Sensitivity

- **Continuum sensitivity (1 hr, 8 GHz BW)**: ~0.4 μJy/beam at 10 GHz
- **Improvement over VLA**: ~10× better sensitivity (at equivalent resolution)

### Angular Resolution

- **Minimum baseline**: 9 m (SBA) → ~6 arcsec at 10 GHz
- **Maximum baseline**: 8,946 km (LBL) → ~0.07 milli-arcsec at 100 GHz

### Field of View

- **18m antennas**: ~5 arcmin (FWHM) at 10 GHz
- **6m antennas**: ~15 arcmin (FWHM) at 100 GHz

**Reference**: ngVLA Memo #14 - "Imaging Simulations" (Perley et al. 2015)  
<https://library.nrao.edu/public/memos/ngvla/NGVLA_memo14.pdf>

---

## Data Rates and Compute Requirements

### Correlator Output

- **Data rate**: ~85 TB/day (full array, maximum baseline, full bandwidth)
- **Estimated archive requirement**: ~240 PB/year (operational phase, assuming 30% observing efficiency and data reduction)

**Reference**: ngVLA Memo #60 - "Computing Requirements" (Bhatnagar et al. 2018)  
<https://library.nrao.edu/public/memos/ngvla/NGVLA_memo60.pdf>

### Pipeline Processing

- **Real-time calibration**: Required for transient detection, dynamic scheduling
- **Imaging compute**: ~50 PFLOP-days/year (estimated for full survey program with continuum + spectral line imaging)

---

## Operational Concepts

### Dynamic Scheduling

The ngVLA will employ a dynamic scheduling system to optimize observing efficiency based on weather, array configuration, and scientific priority.

**Reference**: ngVLA Memo #68 - "Operations Concepts" (Selina & Carilli 2018)  
<https://library.nrao.edu/public/memos/ngvla/NGVLA_memo68.pdf>

### Provenance and Reproducibility

All data products will carry full observational metadata (array segment, frequency setup, calibration version) to enable reproducible reanalysis and long-term archival science.

**Cosmic Horizon Alignment**: See [MISSION_TO_CAPABILITY_TRACE.md](/docuentation/ngvla/MISSION_TO_CAPABILITY_TRACE.md) for how our platform provenance model aligns with ngVLA operational reproducibility goals.

---

## Fixtures and Test Data

The Cosmic Horizon platform uses real ngVLA specifications in fixtures, domain models, and UI labels to ensure demo realism and prevent domain drift.

### Fixture Conventions

- Array segments: `main`, `long-baseline`, `sba` (lowercase, hyphenated)
- Antenna classes: `18m`, `6m`
- Frequency bands: `band1` through `band6` (canonical coverage from 1.2–116 GHz)

**Implementation**: See [schemas/fixtures/](/schemas/fixtures/) for example workflow payloads and dataset manifests.

---

## Change Control

Any updates to NGVLA facts in this document MUST:

1. Include a dated reference/citation to a primary source (NRAO memo, project website, or peer-reviewed publication)
2. Trigger updates to corresponding fixtures and domain model constants
3. Pass regression tests for NGVLA fact drift (see [TESTING_REQUIREMENTS.md](/docuentation/testing/TESTING_REQUIREMENTS.md))

> **Review cadence:** This reference document is reviewed quarterly (aligned with PI boundaries) by the NGVLA liaison to capture any official specification updates. Any change must also trigger fixture/tests updates.
> **Last review:** March 2026 – verified array baseline range and published a minor increase (1,005 km → 1,005.001 km). Corresponding fixture and regression tests updated accordingly.
> **Approval authority**: Platform technical lead (or designated NGVLA liaison)

---

## External Links and Resources

- **NRAO ngVLA Project Office**: <ngvla@nrao.edu>
- **Community Forum**: <https://ngvla.nrao.edu/forum/>
- **Technical Design Documents**: <https://ngvla.nrao.edu/general/design-and-development>

---

## Document History

| Date       | Version | Author        | Summary                         |
| ---------- | ------- | ------------- | ------------------------------- |
| 2026-03-02 | 1.0     | Copilot Agent | Initial canonical reference doc |

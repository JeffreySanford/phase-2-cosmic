<!-- markdownlint-disable MD013 -->

# FSP Continuum vs Spectral Line Processing

Date: 2026-03-06

## Purpose

Document how ngVLA Trident Frequency Slice Processors (FSPs) support continuum versus spectral-line operation, and identify what Cosmic Horizon should simulate in its orchestration layer.

## Bottom Line

The public ngVLA materials support the following architecture:

1. Very Coarse Channelizers (VCCs) first divide wideband antenna input into oversampled frequency slices.
2. Frequency Slice Processors (FSPs) then process those slices independently.
3. In correlation mode, an FSP can be configured for either non-zoom correlation or zoom correlation for a given subarray.
4. The same slice-processing architecture also supports other operating modes such as VLBI and pulsar beamforming.

That means continuum versus spectral-line behavior is primarily a matter of configuration and allocation, not a different hardware path. The orchestrator decides how slices are assigned and whether the allocated FSPs run broader non-zoom correlation or narrower high-resolution zoom processing.

## Source-Backed Findings

### VCCs define the coarse slice boundaries; FSPs process the slices independently

ngVLA Memo #99 states that the Correlator and Beamformer consists of the VCC and the FSPs, that the VCC splits the wideband input stream into narrower oversampled sub-bands called frequency slices, and that the FSPs independently process those slices. The same memo also states that the coarse channelization is the same for all observing modes.

Source:

- https://library.nrao.edu/public/memos/ngvla/NGVLA_99.pdf

Implication:

- Continuum and spectral-line modes share the same VCC front end.
- The distinction appears after slice creation, in how FSP resources are configured and allocated.

### Trident correlation mode explicitly distinguishes non-zoom and zoom operation

The 2018 Trident-CBF design specification defines a normal non-zoom correlation mode and a zoom-window correlation mode.

For non-zoom correlation, the spec describes:

- 14,000 to 15,000 critically sampled channels across the Frequency Slice processed bandwidth
- channel averaging factors
- linearly spaced channels across the processed bandwidth of a slice and adjacent slices from the same digitizer

For zoom correlation, the spec describes:

- at least one tunable zoom window per antenna
- tuning resolution of at least 10 kHz anywhere in the Frequency Slice processed bandwidth
- zoom processed bandwidths that are fractions of the slice bandwidth
- channel count, averaging, integration time, and phase-reference behavior matching non-zoom visibilities
- compliance down to a 220 Hz channel width without averaging

Source:

- https://ngvla.nrao.edu/system/media_files/binaries/222/original/TR-DS-000001_ngVLA_Trident-CBF_Rev1_2018-09-19_signed.pdf?1564612779=

Implication:

- Non-zoom correlation maps cleanly to broad continuum-style processing.
- Zoom correlation maps cleanly to narrow, high-resolution spectral-line work.
- The same FSP type can do either, based on configuration.

### Each subarray in an FSP can be independently configured for zoom or non-zoom correlation

The Trident design spec states that in correlation function mode, each subarray in an FSP shall be independently configurable to correlate zoom or non-zoom visibilities, and that if zoom is enabled then each subarray must have a single zoom-window processed bandwidth independent of the other subarrays.

Source:

- https://ngvla.nrao.edu/system/media_files/binaries/222/original/TR-DS-000001_ngVLA_Trident-CBF_Rev1_2018-09-19_signed.pdf?1564612779=

Implication:

- FSPs are modular at the subarray/configuration level.
- Mixed observing intent across subarrays is a scheduling and allocation problem.
- The orchestrator should not treat continuum mode and spectral-line mode as requiring separate hardware classes.

### Independent FSP processing is central to commensal and multi-mode operation

Memo #99 states that the same frequency slice can be processed simultaneously at two different tridents in the case of commensal observing with multiple observing modes. It also lists planned observing modes including correlation, VLBI, and pulsar beamforming.

Source:

- https://library.nrao.edu/public/memos/ngvla/NGVLA_99.pdf

Implication:

- FSP independence is not just about configuration flexibility.
- It is also what makes concurrent or commensal processing strategies plausible.

### Spectral configuration is an explicit control input to subarray processing

Electronics Memo #19 states that antennas should only be correlated when operating in the same spectral configuration and lists spectral configuration details such as band selection, spectral zoom, and channel width as part of specific scan information. It also describes command flow in which observatory management issues the desired ngVLA configuration and scan timing information to the control system, which then assigns hardware and issues the required commands.

Source:

- https://library.nrao.edu/public/memos/ngvla/NGVLAE_19.pdf

Implication:

- The continuum versus spectral-line distinction belongs in a typed spectral configuration payload.
- FSP allocation should be derived from schedule-block or execution-block intent, not entered manually at the last step.

### Current ngVLA performance material reinforces the broad-vs-narrow distinction

Recent ngVLA imaging performance material distinguishes continuum sensitivity calculations based on maximum instantaneous bandwidth from line sensitivity calculations based on narrower spectral resolution such as 10 km/s channel widths.

Sources:

- https://library.nrao.edu/public/memos/ngvla/NGVLA_55.pdf
- https://library.nrao.edu/public/memos/ngvla/NGVLA_106.pdf

Inference:

- Even though these performance memos are not Trident hardware documents, they align with the expected operational split:
- continuum emphasizes broader processed bandwidth
- spectral-line work emphasizes finer channelization and narrower windows

## Interpretation for Cosmic Horizon

### Continuum-style processing

For orchestration purposes, treat continuum requests as:

- non-zoom correlation
- broader processed slice coverage
- channelization appropriate for wideband imaging and sensitivity
- downstream products centered on integrated visibilities

### Spectral-line / zoom processing

For orchestration purposes, treat spectral-line requests as:

- zoom correlation within one or more selected spectral windows
- narrower processed bandwidth per zoom window
- finer channelization and lower effective channel width
- downstream products centered on high-resolution line cubes or similarly fine spectral products

### Why the FSP abstraction matters

The orchestration consequence is that FSP allocation is a packing problem across independent processors:

- some observations want broad non-zoom slices
- some observations want zoom windows with finer channel spacing
- some observations want VLBI or pulsar beamforming instead of correlation

The system therefore needs to allocate finite FSP capacity according to observing intent, spectral configuration, and subarray membership.

## Recommended Simulation Contracts

Cosmic Horizon should add or refine the following contracts:

- `SpectralConfiguration`
  - band
  - slice definitions
  - zoom enabled
  - zoom window bandwidth
  - channel count
  - target channel width
- `FspAllocationPlan`
  - trident id
  - slice ids
  - operating mode
  - zoom or non-zoom flag
  - subarray id
  - reserved bandwidth product
- `BackendProductPlan`
  - visibility output
  - high-resolution spectral product output
  - VLBI stream output
  - pulsar timing/search output

## Suggested Event Semantics

- `spectral-configuration.validated`
- `fsp-allocation.requested`
- `fsp-allocation.applied`
- `backend-product-plan.created`
- `observation-mode.conflict-detected`

## Claims That Are Strongly Supported vs Inferred

Strongly supported by the sources:

- VCCs create frequency slices.
- FSPs process slices independently.
- Correlation mode has non-zoom and zoom variants.
- Each subarray in an FSP can be independently configured for zoom or non-zoom correlation.
- Multiple observing modes share the same overall architecture.

Reasonable inference, but not stated in exactly these words:

- non-zoom correlation is the right software analogue for continuum-style processing
- zoom correlation is the right software analogue for spectral-line processing
- Cosmic Horizon should model FSP allocation as a schedulable execution-layer resource problem

## References

1. ngVLA Memo #99
   - https://library.nrao.edu/public/memos/ngvla/NGVLA_99.pdf
2. Trident-CBF Preliminary Design Specification (2018)
   - https://ngvla.nrao.edu/system/media_files/binaries/222/original/TR-DS-000001_ngVLA_Trident-CBF_Rev1_2018-09-19_signed.pdf?1564612779=
3. ngVLA Electronics Memo #19
   - https://library.nrao.edu/public/memos/ngvla/NGVLAE_19.pdf
4. ngVLA performance / sensitivity memo material
   - https://library.nrao.edu/public/memos/ngvla/NGVLA_55.pdf
   - https://library.nrao.edu/public/memos/ngvla/NGVLA_106.pdf

<!-- markdownlint-enable MD013 -->

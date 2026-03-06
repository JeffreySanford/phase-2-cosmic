<!-- markdownlint-disable MD013 -->

# Trident Integration Research

Date: 2026-03-06

## Purpose

Translate the ngVLA Trident Correlator/Beamformer architecture into concrete execution-layer requirements for Cosmic Horizon. The goal is not to emulate FPGA signal processing in software; it is to model how a scheduler and orchestration plane would issue valid configuration, routing, and downstream processing instructions around a Trident-like backend.

Companion note:

- `FSP_CONTINUUM_VS_SPECTRAL_LINE_2026-03-06.md` for a focused breakdown of how VCC/FSP configuration supports continuum versus spectral-line/zoom processing.

## Sources Reviewed

Primary sources used for this note:

1. NRAO ngVLA Trident-CBF Preliminary Design Specification (2018)
   - https://ngvla.nrao.edu/system/media_files/binaries/222/original/TR-DS-000001_ngVLA_Trident-CBF_Rev1_2018-09-19_signed.pdf?1564612779=
2. ngVLA Memo #99, "SETI with the ngVLA" (beamformer architecture discussion)
   - https://library.nrao.edu/public/memos/ngvla/NGVLA_99.pdf
3. ngVLA Electronics Memo #19, "ngVLA CSP X-Engine Subarraying Concept" (2025)
   - https://library.nrao.edu/public/memos/ngvla/NGVLAE_19.pdf
4. ngVLA Electronics Memo #16, "Trade Study: CSP Internal Data Interchange Format"
   - https://library.nrao.edu/public/memos/ngvla/NGVLAE_16.pdf
5. ngVLA public site, current technical overview and performance pages
   - https://ngvla.nrao.edu/
   - https://ngvla.nrao.edu/page/performance
6. ngVLA Memo #109, RFI system architecture updates
   - https://library.nrao.edu/public/memos/ngvla/NGVLA_109.pdf

## Validated Facts

### 1. Trident is a frequency-slice correlator/beamformer architecture inside the CSP

The Trident-CBF design spec describes Trident as the ngVLA correlator-beamformer reference design using the NRC Frequency Slice Architecture. Memo #99 independently describes the ngVLA CBF as two major parts:

- VCC: Very Coarse Channelizer
- FSP: Frequency Slice Processors

Memo #99 states that the VCC splits the wideband input stream into oversampled "frequency slices" and that the FSPs process those slices independently.

Why it matters here:

- Cosmic Horizon should model Trident as a configurable execution target made of slice-processing resources, not as one opaque correlator job.

### 2. The 2018 Trident reference design is explicitly a three-trident system

The 2018 Trident spec states that a "trident" is one third of the full system and that the complete Trident-CBF consists of 3 tridents. The same document also states that each of the 3 tridents provides:

- 10 GHz/pol of processing
- 50 independently configurable FSPs

Why it matters here:

- An execution layer needs explicit placement and routing decisions.
- Subarray and observing-mode plans should be schedulable against finite Trident/FSP capacity.

### 3. The Trident reference design was sized for 263 antennas and Stratix 10-era hardware

The Trident spec ties the design to at least 263 antennas and describes the implementation in TALON-DX Stratix-10 technology.

Why it matters here:

- Our simulation contracts should retain antenna-count and hardware-generation metadata.
- Resource planners should treat hardware assumptions as versioned constraints rather than timeless facts.

### 4. FSPs are the flexibility point and support multiple functional modes

The Trident spec and Memo #99 both support the same broad conclusion: FSPs are configured per mode. Publicly described modes include:

- interferometric correlation
- VLBI beamforming
- pulsar beamforming / timing / search variants

The 2018 spec includes explicit VLBI and pulsar function modes. It also documents a pulsar phase-delay mode using up to 168 antennas and a true-delay mode that, in that revision, only partially met the 168-antenna target.

Why it matters here:

- Orchestration logic must turn observation intent into mode-specific FSP allocation plans.
- "Run observation" is not enough. The control plane needs typed processing intents.

### 5. Schedule blocks and execution blocks are a strong fit for orchestration modeling

Electronics Memo #19 defines:

- Schedule Block: minimum unit of planned observation that can be executed and gracefully exited
- Execution Block: time-specific instance of a schedule block

The same memo says observatory management issues configuration instructions hierarchically, and the control/management layer then assigns hardware to subarrays and channel blocks at a specific time of application.

Why it matters here:

- Cosmic Horizon should model Trident orchestration as `schedule block -> execution block -> timed hardware/software configuration actions`.
- This is a better semantic fit than generic "job start" events.

### 6. Spectral configuration is a first-class part of subarray setup

Memo #19 explicitly assumes antennas are only correlated when they share the same spectral configuration and defines "specific scan information" to include spectral configuration details such as band selection, spectral zoom, and channel count.

Why it matters here:

- Spectral configuration should be a typed payload in our event contracts.
- FSP/VCC assignment cannot be separated from subarray spectral intent.

### 7. Downstream data products differ by mode and require separate backend handling

Electronics Memo #16 summarizes distinct data flows leaving the signal-processing stages:

- channelized and beamformed data for external VLBI
- time-integrated visibilities
- pulsar timing data
- pulsar search data

It also notes PSRFITS as the specified output format for the Pulsar Engine. Memo #109 describes a high-rate CSP-to-CBE boundary and places additional mitigation/averaging work in the correlator back end.

Why it matters here:

- A Trident-aware orchestration layer needs both an upstream hardware plan and a downstream product-delivery plan.
- Different observing modes should fan out into different backend job templates and archive handoff contracts.

## Important Baseline Drift / Open Questions

### 1. The "28 GHz aggregate bandwidth per polarization" claim is not currently validated

I did not find a current NRAO source confirming the exact "28 GHz aggregate bandwidth per polarization" figure from the prompt.

What I did validate:

- the 2018 Trident design spec describes 3 tridents x 10 GHz/pol each
- the current public ngVLA performance page says the observatory supports up to 20 GHz of instantaneous sampled bandwidth per polarization

Inference:

- the prompt likely mixes older Trident reference-design numbers with later or derived system-level summaries
- for repo documentation, we should avoid locking on "28 GHz/pol" unless we find a newer authoritative design document that says exactly that

### 2. "Intel Stratix 10 FPGA boards" is directionally correct for the 2018 reference design, but should stay versioned

The 2018 Trident spec is clearly Stratix-10/TALON-DX based. That is sufficient for a historical/reference note, but future ngVLA hardware updates could change this. Our docs should refer to it as the validated 2018 reference-design implementation, not an eternal truth.

### 3. CSP Supervisory Computer / exact spectral-configuration payload shapes are not fully public here

The orchestration concept in the prompt is reasonable, but the exact payload schema, CSP supervisory-computer interfaces, and authoritative ICDs were not found in the public materials reviewed today.

Inference:

- we should model these as project-local contracts inspired by ngVLA concepts, not as faithful replicas of unreleased ICDs

## What This Means For Cosmic Horizon

### Execution-Layer Design Principle

Cosmic Horizon should position its NestJS/Go services as a simulated execution layer between:

- observation intent coming from scheduler/governance workflows
- Trident-like CSP resource allocation
- downstream correlator/beamformer backend jobs

That means the platform should generate and move configuration objects such as:

- `SubarrayConfiguration`
- `SpectralConfiguration`
- `TridentRoutingPlan`
- `FspAllocationPlan`
- `CbeProcessingPlan`
- `ArchiveStagingPlan`

### Recommended Event Flow

1. Scheduler or governance plane emits a `schedule-block.accepted` event.
2. Execution service expands it into an `execution-block.created` event with timing, subarray membership, and observing mode.
3. A Trident orchestration service computes:
   - antenna-to-trident routing
   - VCC / frequency-slice mapping
   - FSP allocations by observing mode
   - downstream CBE or beam product jobs
4. The service emits a versioned `subarray-configuration.requested` command payload.
5. Adapter services translate that payload into:
   - simulated DBE route updates
   - simulated CSP/Trident configuration
   - simulated CBE processing startup
6. Status and provenance events confirm:
   - accepted
   - applied
   - active
   - degraded
   - failed
   - archived

### Recommended Domain Objects

- `SchedulingBlock`
  - science intent, required mode, target, priority, timing constraints
- `ExecutionBlock`
  - timed instance of a scheduling block
- `Subarray`
  - antenna membership, receiver band, polarization assumptions
- `SpectralConfiguration`
  - band selection, channel count, zoom windows, slice width, slice count
- `TridentCapacitySnapshot`
  - available tridents, available FSPs, reserved slices, current load
- `FspAllocationPlan`
  - slice-to-FSP placement, mode, antenna limits, bandwidth product
- `BackendProductPlan`
  - visibilities, VLBI stream, pulsar timing stream, pulsar search stream
- `ProvenanceRecord`
  - source schedule block, resolved execution block, config versions, applied timestamps

### Proposed Simulation Scope

Good near-term simulation:

- treat Trident as a finite pool of slice-processing resources
- validate that requested observations fit available trident/FSP capacity
- reject incompatible subarray/spectral combinations
- spin up different downstream mock jobs depending on correlation/VLBI/pulsar mode
- attach provenance showing which configuration version created each output stream

What not to simulate yet:

- FPGA personalities in detail
- real packet-level VCC or VDIF transport
- precise NRC/NRAO ICD compatibility claims

### Integration Risks

- Public docs show concept direction, not full operational ICDs. Overclaiming fidelity would be inaccurate.
- The current public ngVLA baseline appears to differ from older Trident numbers in some bandwidth details.
- Backend responsibilities span multiple systems; a single "submit job" API will be too coarse if we want realistic orchestration behavior.

### Recommended Next Steps

1. Add Trident-flavored contracts and events to the governance and messaging documentation.
2. Model schedule-block and execution-block entities explicitly in the control plane.
3. Add a Trident resource allocator that can place FSP work across three simulated tridents.
4. Create backend job templates for:
   - visibilities / correlation
   - VLBI stream delivery
   - pulsar timing products
   - pulsar search products
5. Add provenance fields that capture spectral configuration, subarray composition, and applied execution time.
6. Keep a standing open question list for bandwidth-baseline drift and unpublished interface details.

## Source Notes

Short source-backed fact list used in this note:

- Trident-CBF 2018 spec: 3 tridents, 10 GHz/pol per trident, 50 FSPs per trident, 263-antenna sizing, Stratix-10 implementation
- Memo #99: CBF split into VCC + FSP, phase-delay and true-delay pulsar beamforming concepts
- Memo #19: schedule block / execution block terminology, hierarchical command flow, spectral configuration as part of scan-specific information
- Memo #16: distinct downstream data varieties and PSRFITS for pulsar output
- Memo #109: CBE still performs important downstream handling and sits on a defined CSP-to-CBE throughput boundary
- ngVLA public performance page: current public baseline says up to 20 GHz instantaneous sampled bandwidth per polarization

<!-- markdownlint-enable MD013 -->

# Executive Summary — Phase 2 (Verbose)

Cosmic Horizon: Hybrid Control Plane for Exascale Scientific Operations

Overview

Cosmic Horizon is a hybrid control plane architecture designed to govern, operate, and make trustworthy the exascale data environment required by next-generation radio astronomy facilities such as the National Radio Astronomy Observatory’s ngVLA. At sustained data rates of petabytes per year and continuous multi-gigabyte-per-second streams during observations, conventional monolithic architectures struggle: either operational responsiveness collapses under telemetry load or governance promises (auditability, reproducibility, policy enforcement) are compromised.

The Phase 2 specification formalizes a deliberate separation of concerns into two complementary planes that together create a Data Trust Platform:

- The Operational Streaming Plane (implemented primarily in Go) for high-velocity telemetry, low-latency visibility, and protective stream shaping.

- The Governance & Orchestration Control Plane (implemented primarily in Java) for authoritative cataloging, lineage, job orchestration, access control, and immutable audit records.

Why hybrid? Why now?

1. Performance vs. Accountability: Operational telemetry (health metrics, calibration progress, anomaly detections, scheduler events) requires sub-second delivery to dashboards and operators. Persisting every event in the authoritative governance store is infeasible at scale. Offloading real-time concerns to a purpose-built streaming plane preserves operational velocity while keeping governance consistent through curated event handoffs.

1. Reproducibility at Infrastructure Scale: Scientific reproducibility demands complete provenance for Science Ready Data Products (SRDPs): raw inputs, pipeline versions, parameters, compute environment, and orchestration traces. These governance properties are best enforced in a typed, durable control plane that treats metadata as first-class, long-lived assets.

1. Operational Safety: An observatory is a continuously operating instrument. Streaming degradations, backpressure, and graceful fallbacks are necessary to avoid operator overload and to keep HPC archives isolated from operational surge.

Architectural Principles

- Separation of Concerns: Each plane is optimized for a distinct set of operational properties (latency and throughput for the streaming plane; durability, consistency, and governance semantics for the control plane).

- Explicit Contracts: All inter-plane interactions are governed by well-defined, versioned contracts: event schemas, allowed side-effects, idempotency semantics, and retry/backoff policies.

- Immutability & Auditability: Governance artifacts (catalog entries, lineage edges, audit manifests) are append-only or versioned, with cryptographically secure hashes where appropriate to support long-term verification.

- Observable Degradation: The streaming plane implements bounded fan-out, windowed aggregation, and degradation modes that intentionally simplify payloads under load rather than silently dropping critical governance signals.

- Reproducibility by Design: Every SRDP created in the system must be accompanied by a complete provenance bundle that can be replayed to recreate results deterministically.

What each plane does

- Operational Streaming Plane (Go): Ingests telemetry via enterprise message brokers (Kafka/Pulsar/RabbitMQ), applies lightweight validation and triage, performs windowed aggregation and feature extraction, enforces backpressure and degradation policies, and forwards curated events to dashboards and to the governance plane when durable record creation is required.

- Governance & Orchestration Control Plane (Java): Acts as the authoritative system of record for archival catalog metadata, provenance graphs, access policies, lifecycle rules, job orchestration definitions, and immutable audit manifests. Uses typed relational models and durable storage to preserve institutional memory.

End-to-end guarantees

Cosmic Horizon’s design provides two complementary guarantees:

1. Operational Visibility Guarantee — sub-second, de-duplicated, and human-readable operational signals delivered to operator UIs and automated runbooks, achieved through streaming aggregation and protective fan-out.

1. Scientific Trust Guarantee — reproducibility, provenance, policy enforcement, and auditable lineage for SRDPs enforced by the governance plane and anchored by signed audit manifests.

Strategic outcomes

- Reduces human bottlenecks by enabling engineers to act on concise operational signals rather than raw firehoses.

- Transforms archives into active knowledge systems that support reproducible research across decades.

- Enables scalable AI-driven agents (calibration, anomaly detection, reconstruction) to operate safely by bounding their telemetry footprint while preserving auditable lineage for scientific outputs.

Next steps for Phase 2

1. Formalize event and provenance schemas; publish contract v1.0.
1. Prototype inter-plane contract test harnesses and message simulators at production scale.
1. Implement hardened backpressure and degradation modes in the streaming gateway and validate with load tests.
1. Design secure signing and long-term archival strategies for audit manifests and provenance bundles.
1. Establish an integration lab with TACC/HPC to validate real SRDP pipelines and lifecycle workflows.

This document and the companion files in this folder serve as the starting point for technical working groups, security review boards, and operations teams to convert prototype capabilities into a production-ready platform.

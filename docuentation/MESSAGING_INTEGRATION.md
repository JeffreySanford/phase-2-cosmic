# Messaging Integration: Pulsar, Kafka, RabbitMQ (Phase 2)

## Overview

This document prescribes roles, integration patterns, connectors, and operational guidance for combining Apache Pulsar, Apache Kafka (Confluent-compatible), and RabbitMQ in Phase 2.

High-level recommendation

- Pulsar: edge/ingest and geo-buffering at remote telescope sites; use Pulsar for local resiliency and tiered storage where links are intermittent.
- Kafka: central durable log for high-throughput ETL, stream processing, and sinks into the Data Lake (use Confluent or vanilla Kafka as preferred).
- RabbitMQ: control-plane messaging, RPC/command patterns, and operational workflows where routing and ack-backed queues are required.

## Roles & Responsibilities

- Edge ingestion (Pulsar):
  - Local buffering and short-term retention on-site.
  - Built-in geo-replication or tiered-offload to central clusters.
  - Use Pulsar IO or connectors to forward validated topics to central processing paths.

- Central processing (Kafka):
  - High-throughput, partitioned topics for ETL and analytics.
  - Stream processing with Flink/Kafka Streams and durable retention for replay.
  - Sink connectors (Kafka Connect) for bulk writes to object stores (S3/MinIO) and databases.

- Control & orchestration (RabbitMQ):
  - Short-lived command messages, job dispatch, and RPC between UI/operators and the Governance API.
  - Mirror critical control events into Kafka for audit/ETL when required.

## Integration Patterns

- Pulsar → Kafka
  - Pattern A: Centralize on Pulsar for edge ingress, then use a Pulsar→Kafka sink (Pulsar IO) to populate Kafka topics for analytics.
  - Pattern B: Use KoP (Kafka-on-Pulsar) selectively if you want Kafka clients to talk to Pulsar during migration.

- Kafka ↔ RabbitMQ
  - Bridge control events using Kafka Connect RabbitMQ Sink/Source or RabbitMQ Shovel for operational messages that must also be captured in Kafka for auditing.
  - Avoid using RabbitMQ for bulk telemetry; it is for control/command messages.

- Schema & contract handling
  - Use a shared schema registry (Confluent Schema Registry or Apicurio) and enforce schema compatibility on producer/consumer topics.

## Connectors and tooling

- Recommended connectors:
  - `pulsar-io-kafka` (Pulsar IO Kafka sink) or native Pulsar sink connectors
  - `kafka-connect-s3` (for object store sinks)
  - `kafka-connect-rabbitmq` (bridge small control flows)
  - `rabbitmq-shovel` for lightweight bridging in constrained environments

- Operational notes:
  - Test connector throughput and partitioning behavior; connectors add overhead and must be tuned.
  - Use dead-letter-queues (DLQs) for failed deliveries and monitor connector lag.

## Security, Observability, and Operations

- Security:
  - Enforce TLS/mTLS for cross-site replication and broker-to-broker communication.
  - Apply ACLs at topic/exchange level; use role-based policies for producers/consumers.

- Observability:
  - Export metrics to Prometheus (JMX exporter for Kafka, Pulsar metrics endpoint, RabbitMQ Prometheus exporter).
  - Trace cross-system flows using distributed tracing (W3C traceparent) and correlate via `producer_id` and `sequence` fields.

- Operations:
  - Keep clear runbooks for connector restarts, schema migrations, and reprocessing flows.
  - Automate smoke-tests that validate end-to-end delivery from edge -> central -> sink.

## Example flows (Mermaid)

### Edge ingest -> central ETL

```mermaid
flowchart LR
  Telescope[Remote Telescope Site] --> PulsarEdge[Pulsar_Edge_Buffer]
  PulsarEdge --> CentralPulsar[Central_Pulsar_Cluster]
  CentralPulsar --> CentralKafka[Kafka_ETL_Topics]
  CentralKafka --> ETL[Flink_Kafka_Streams]
  ETL --> DataLake[Object_Store_DataLake]
  %% Legend
  subgraph Legend[Legend]
    L_edge[Edge]
    L_broker[Broker]
    L_processing[Processing]
    L_storage[Storage]
  end

  style L_edge fill:#1f78b4,stroke:#0b3a66
  style L_broker fill:#33a02c,stroke:#1b5e20
  style L_processing fill:#ff7f00,stroke:#b35400
  style L_storage fill:#6a3d9a,stroke:#3b1f4d
```

### Control & orchestration flow

```mermaid
flowchart LR
  UI[Operator_UI] --> Rabbit[Control_Queue_RabbitMQ]
  Rabbit --> Governance[Java_Governance_API]
  Governance --> KafkaAudit[Kafka_Audit_Topic]
  KafkaAudit --> Archiver[Kafka_Connect_S3]
  %% Legend
  subgraph Legend2[Legend]
    L_control[Control]
    L_gov[Governance]
    L_audit[Audit]
  end

  style L_control fill:#e31a1c,stroke:#74110b
  style L_gov fill:#6a3d9a,stroke:#3b1f4d
  style L_audit fill:#ffcc00,stroke:#b88600


  %% Compact Legend (bottom-right)
  subgraph Legend[ ]
    direction TB
    L_control[Control]
    L_gov[Gov]
    L_audit[Audit]
  end
    style L_control fill:#e31a1c,stroke:#74110b,color:#ffffff,font-size:10px
    style L_gov fill:#6a3d9a,stroke:#3b1f4d,color:#ffffff,font-size:10px
    style L_audit fill:#ffcc00,stroke:#b88600,color:#000000,font-size:10px
  classDef legendClass font-size:10px;
  class L_control,L_gov,L_audit legendClass
```

### Dev / local topology (simplified)

```mermaid
flowchart LR
  subgraph Dev
    DG[Data_Generator] --> PulsarEdge
    PulsarEdge --> CentralPulsar
    CentralPulsar --> PulsarToKafka[Connector_Pulsar_to_Kafka]
    PulsarToKafka --> Kafka
    Rabbit[RabbitMQ] --> Governance
    Governance --> Kafka
    Kafka --> ETL
    ETL --> DataLake
  end
  %% Legend
  subgraph Legend3[Legend]
    L_dev[Dev Services]
    L_connector[Connector]
    L_storage[Storage]
  end

  style L_dev fill:#1f78b4,stroke:#0b3a66
  style L_connector fill:#33a02c,stroke:#1b5e20
  style L_storage fill:#ff7f00,stroke:#b35400


  %% Compact Legend (bottom-right)
  subgraph Legend[ ]
    direction TB
    L_dev[Dev]
    L_connector[Connector]
    L_storage[Storage]
  end
    style L_dev fill:#1f78b4,stroke:#0b3a66,color:#ffffff,font-size:10px
    style L_connector fill:#33a02c,stroke:#1b5e20,color:#ffffff,font-size:10px
    style L_storage fill:#ff7f00,stroke:#b35400,color:#ffffff,font-size:10px
  classDef legendClass font-size:10px;
  class L_dev,L_connector,L_storage legendClass
```

## Example recommendations for `docker/dev-compose.yml`

- Include lightweight containers for: Pulsar (or Pulsar standalone), Kafka + Zookeeper (or KRaft), RabbitMQ, a small Kafka Connect instance, and the `tools/data-generator` service.
- Provide a Pulsar→Kafka connector example and a simple RabbitMQ bridge to Kafka for control events.

## Testing and smoke-tests

- End-to-end smoke test:
  1. Start dev compose environment.
  2. Run `tools/data-generator` to produce sample telemetry to PulsarEdge.
  3. Verify a message delivered to Kafka and written to the object store via connector.
  4. Verify governance control messages sent via RabbitMQ are mirrored into Kafka audit topics.

## Next steps

- Add `docker/dev-compose.yml` examples and connector configs to `documentation/` (recommended next task).

package com.cosmic.governance.api.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Service
public class GovernanceRuntimeMetricsService {
    private final MeterRegistry meterRegistry;

    public GovernanceRuntimeMetricsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void recordJobSubmitted(String workflow) {
        counter("governance_job_submissions_total", "workflow", safe(workflow)).increment();
    }

    public void recordJobTransition(String workflow, String fromState, String toState) {
        counter(
                "governance_job_transitions_total",
                "workflow", safe(workflow),
                "from_state", safe(fromState),
                "to_state", safe(toState)
        ).increment();
    }

    public void recordJobDispatch(String workflow, String executor) {
        counter(
                "governance_job_dispatch_total",
                "workflow", safe(workflow),
                "executor", safe(executor)
        ).increment();
    }

    public void recordJobDispatchWait(String workflow, String executor, Duration waitTime) {
        if (waitTime == null || waitTime.isNegative()) {
            return;
        }
        Timer.builder("governance_job_dispatch_wait_seconds")
                .publishPercentileHistogram()
                .tag("workflow", safe(workflow))
                .tag("executor", safe(executor))
                .register(meterRegistry)
                .record(waitTime);
    }

    public void recordJobTerminalState(String workflow, String executor, String result, Duration runtime) {
        counter(
                "governance_job_terminal_total",
                "workflow", safe(workflow),
                "executor", safe(executor),
                "result", safe(result)
        ).increment();

        if (runtime == null || runtime.isNegative()) {
            return;
        }

        Timer.builder("governance_job_terminal_duration_seconds")
                .publishPercentileHistogram()
                .tag("workflow", safe(workflow))
                .tag("executor", safe(executor))
                .tag("result", safe(result))
                .register(meterRegistry)
                .record(runtime);
    }

    public void recordWorkflowRuntime(String workflow, String executor, String result, Duration runtime) {
        if (runtime == null || runtime.isNegative()) {
            return;
        }
        Timer.builder("governance_job_runtime_seconds")
                .publishPercentileHistogram()
                .tag("workflow", safe(workflow))
                .tag("executor", safe(executor))
                .tag("result", safe(result))
                .register(meterRegistry)
                .record(runtime);
    }

    public void recordArtifactAttached(String workflow, String artifactName, Object artifactPayload) {
        counter(
                "governance_job_artifacts_total",
                "workflow", safe(workflow),
                "artifact_name", safe(artifactName)
        ).increment();

        DistributionSummary.builder("governance_job_artifact_payload_bytes")
                .publishPercentileHistogram()
                .baseUnit("bytes")
                .tag("workflow", safe(workflow))
                .tag("artifact_name", safe(artifactName))
                .register(meterRegistry)
                .record(approxPayloadBytes(artifactPayload));
    }

    public void recordArtifactRead(String artifactKind, Object payload, boolean success, Duration duration) {
        counter(
                "governance_artifact_reads_total",
                "artifact_kind", safe(artifactKind),
                "result", success ? "success" : "failure"
        ).increment();

        if (success) {
            DistributionSummary.builder("governance_artifact_read_payload_bytes")
                    .publishPercentileHistogram()
                    .baseUnit("bytes")
                    .tag("artifact_kind", safe(artifactKind))
                    .register(meterRegistry)
                    .record(approxPayloadBytes(payload));
        }

        if (duration != null && !duration.isNegative()) {
            Timer.builder("governance_artifact_read_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("artifact_kind", safe(artifactKind))
                    .tag("result", success ? "success" : "failure")
                    .register(meterRegistry)
                    .record(duration);
        }
    }

    public void recordRabbitPublish(String exchange, String routingKey, Object payload, boolean success) {
        recordRabbitPublish(exchange, routingKey, payload, success, null);
    }

    public void recordRabbitPublish(
            String exchange,
            String routingKey,
            Object payload,
            boolean success,
            Duration duration
    ) {
        counter(
                "governance_rabbitmq_publish_total",
                "exchange", safe(exchange),
                "routing_key", safe(routingKey),
                "result", success ? "success" : "failure"
        ).increment();

        if (success) {
            DistributionSummary.builder("governance_rabbitmq_publish_payload_bytes")
                    .baseUnit("bytes")
                    .tag("exchange", safe(exchange))
                    .tag("routing_key", safe(routingKey))
                    .register(meterRegistry)
                    .record(approxPayloadBytes(payload));
        }
        if (duration != null && !duration.isNegative()) {
            Timer.builder("governance_rabbitmq_publish_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("exchange", safe(exchange))
                    .tag("routing_key", safe(routingKey))
                    .tag("result", success ? "success" : "failure")
                    .register(meterRegistry)
                    .record(duration);
        }
    }

    public void recordKafkaPublish(String topic, String eventType, Object payload, boolean success) {
        recordKafkaPublish(topic, eventType, payload, success, null);
    }

    public void recordKafkaPublish(
            String topic,
            String eventType,
            Object payload,
            boolean success,
            Duration duration
    ) {
        counter(
                "governance_kafka_publish_total",
                "topic", safe(topic),
                "event_type", safe(eventType),
                "result", success ? "success" : "failure"
        ).increment();

        if (success) {
            DistributionSummary.builder("governance_kafka_publish_payload_bytes")
                    .baseUnit("bytes")
                    .tag("topic", safe(topic))
                    .tag("event_type", safe(eventType))
                    .register(meterRegistry)
                    .record(approxPayloadBytes(payload));
        }
        if (duration != null && !duration.isNegative()) {
            Timer.builder("governance_kafka_publish_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("topic", safe(topic))
                    .tag("event_type", safe(eventType))
                    .tag("result", success ? "success" : "failure")
                    .register(meterRegistry)
                    .record(duration);
        }
    }

    public void recordRedisRead(String store, String keyspace, Object payload) {
        recordRedisRead(store, keyspace, payload, true, null);
    }

    public void recordRedisRead(
            String store,
            String keyspace,
            Object payload,
            boolean success,
            Duration duration
    ) {
        counter(
                "governance_redis_operations_total",
                "store", safe(store),
                "keyspace", safe(keyspace),
                "operation", "read",
                "result", success ? "success" : "failure"
        ).increment();

        if (success) {
            counter(
                    "governance_redis_reads_total",
                    "store", safe(store),
                    "keyspace", safe(keyspace)
            ).increment();

            DistributionSummary.builder("governance_redis_read_payload_bytes")
                    .baseUnit("bytes")
                    .tag("store", safe(store))
                    .tag("keyspace", safe(keyspace))
                    .register(meterRegistry)
                    .record(approxPayloadBytes(payload));
        }

        if (duration != null && !duration.isNegative()) {
            Timer.builder("governance_redis_operation_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("store", safe(store))
                    .tag("keyspace", safe(keyspace))
                    .tag("operation", "read")
                    .tag("result", success ? "success" : "failure")
                    .register(meterRegistry)
                    .record(duration);
        }
    }

    public void recordRedisWrite(String store, String keyspace, Object payload) {
        recordRedisWrite(store, keyspace, payload, true, null);
    }

    public void recordRedisWrite(
            String store,
            String keyspace,
            Object payload,
            boolean success,
            Duration duration
    ) {
        counter(
                "governance_redis_operations_total",
                "store", safe(store),
                "keyspace", safe(keyspace),
                "operation", "write",
                "result", success ? "success" : "failure"
        ).increment();

        if (success) {
            counter(
                    "governance_redis_writes_total",
                    "store", safe(store),
                    "keyspace", safe(keyspace)
            ).increment();

            DistributionSummary.builder("governance_redis_write_payload_bytes")
                    .baseUnit("bytes")
                    .tag("store", safe(store))
                    .tag("keyspace", safe(keyspace))
                    .register(meterRegistry)
                    .record(approxPayloadBytes(payload));
        }

        if (duration != null && !duration.isNegative()) {
            Timer.builder("governance_redis_operation_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("store", safe(store))
                    .tag("keyspace", safe(keyspace))
                    .tag("operation", "write")
                    .tag("result", success ? "success" : "failure")
                    .register(meterRegistry)
                    .record(duration);
        }
    }

    public void recordObjectWrite(String storage, String objectKind, String executor, Object payload) {
        recordObjectWrite(storage, objectKind, executor, payload, true, null);
    }

    public void recordObjectWrite(
            String storage,
            String objectKind,
            String executor,
            Object payload,
            boolean success,
            Duration duration
    ) {
        counter(
                "governance_object_write_attempts_total",
                "storage", safe(storage),
                "object_kind", safe(objectKind),
                "executor", safe(executor),
                "result", success ? "success" : "failure"
        ).increment();

        if (success) {
            counter(
                    "governance_object_writes_total",
                    "storage", safe(storage),
                    "object_kind", safe(objectKind),
                    "executor", safe(executor)
            ).increment();

            DistributionSummary.builder("governance_object_write_payload_bytes")
                    .baseUnit("bytes")
                    .tag("storage", safe(storage))
                    .tag("object_kind", safe(objectKind))
                    .tag("executor", safe(executor))
                    .register(meterRegistry)
                    .record(approxPayloadBytes(payload));
        }

        if (duration != null && !duration.isNegative()) {
            Timer.builder("governance_object_write_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("storage", safe(storage))
                    .tag("object_kind", safe(objectKind))
                    .tag("executor", safe(executor))
                    .tag("result", success ? "success" : "failure")
                    .register(meterRegistry)
                    .record(duration);
        }
    }

    public void recordDatasetMutation(String operation, Object payload) {
        counter(
                "governance_dataset_mutations_total",
                "operation", safe(operation)
        ).increment();

        DistributionSummary.builder("governance_dataset_mutation_payload_bytes")
                .baseUnit("bytes")
                .tag("operation", safe(operation))
                .register(meterRegistry)
                .record(approxPayloadBytes(payload));
    }

    public void recordBusinessAction(String resource, String action, Object payload) {
        recordBusinessAction(resource, action, payload, true);
    }

    public void recordBusinessAction(String resource, String action, Object payload, boolean success) {
        counter(
                "governance_business_actions_total",
                "resource", safe(resource),
                "action", safe(action),
                "result", success ? "success" : "failure"
        ).increment();

        DistributionSummary.builder("governance_business_action_payload_bytes")
                .baseUnit("bytes")
                .tag("resource", safe(resource))
                .tag("action", safe(action))
                .tag("result", success ? "success" : "failure")
                .register(meterRegistry)
                .record(approxPayloadBytes(payload));
    }

    public void recordJobMetadataMutation(String mutationType, Object payload) {
        counter(
                "governance_job_metadata_mutations_total",
                "mutation_type", safe(mutationType)
        ).increment();

        DistributionSummary.builder("governance_job_metadata_mutation_payload_bytes")
                .baseUnit("bytes")
                .tag("mutation_type", safe(mutationType))
                .register(meterRegistry)
                .record(approxPayloadBytes(payload));
    }

    public void recordOperatorRead(String resourceType, Object payload) {
        String resourceFamily = operatorReadFamily(resourceType);
        counter(
                "governance_operator_reads_total",
                "resource_type", safe(resourceType),
                "resource_family", resourceFamily
        ).increment();

        DistributionSummary.builder("governance_operator_read_payload_bytes")
                .baseUnit("bytes")
                .tag("resource_type", safe(resourceType))
                .tag("resource_family", resourceFamily)
                .register(meterRegistry)
                .record(approxPayloadBytes(payload));
    }

    public void recordRestoreDrill(boolean success, long durationMs, Object payload) {
        counter(
                "governance_restore_drills_total",
                "result", success ? "success" : "failure"
        ).increment();

        DistributionSummary.builder("governance_restore_drill_duration_ms")
                .baseUnit("ms")
                .tag("result", success ? "success" : "failure")
                .register(meterRegistry)
                .record(Math.max(durationMs, 0));

        DistributionSummary.builder("governance_restore_drill_payload_bytes")
                .baseUnit("bytes")
                .tag("result", success ? "success" : "failure")
                .register(meterRegistry)
                .record(approxPayloadBytes(payload));
    }

    public void recordDeferredRelease(int releasedCount) {
        if (releasedCount <= 0) {
            return;
        }
        counter("governance_scheduler_deferred_releases_total")
                .increment(releasedCount);
    }

    public void recordExternalAdapterRequest(
            String adapter,
            String operation,
            String target,
            Object payload,
            boolean success,
            String errorClass,
            Duration duration
    ) {
        String targetHost = targetHost(target);
        counter(
                "governance_external_adapter_requests_total",
                "adapter", safe(adapter),
                "operation", safe(operation),
                "target_host", targetHost,
                "result", success ? "success" : "failure",
                "error_class", success ? "none" : safe(errorClass)
        ).increment();

        DistributionSummary.builder("governance_external_adapter_request_payload_bytes")
                .baseUnit("bytes")
                .tag("adapter", safe(adapter))
                .tag("operation", safe(operation))
                .tag("target_host", targetHost)
                .register(meterRegistry)
                .record(approxPayloadBytes(payload));

        if (duration != null && !duration.isNegative()) {
            Timer.builder("governance_external_adapter_request_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("adapter", safe(adapter))
                    .tag("operation", safe(operation))
                    .tag("target_host", targetHost)
                    .tag("result", success ? "success" : "failure")
                    .register(meterRegistry)
                    .record(duration);
        }
    }

    private Counter counter(String name, String... tags) {
        return Counter.builder(name)
                .tags(tags)
                .register(meterRegistry);
    }

    private double approxPayloadBytes(Object payload) {
        if (payload == null) {
            return 0.0d;
        }
        return String.valueOf(payload).getBytes(StandardCharsets.UTF_8).length;
    }

    private String targetHost(String target) {
        if (target == null || target.isBlank()) {
            return "unknown";
        }
        try {
            URI uri = URI.create(target);
            String host = uri.getHost();
            return safe(host == null || host.isBlank() ? target : host);
        } catch (Exception ex) {
            return safe(target);
        }
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "unknown" : value;
    }

    private String operatorReadFamily(String resourceType) {
        String value = safe(resourceType);
        if (value.startsWith("job_")) {
            return "jobs";
        }
        if (value.startsWith("dataset_")) {
            return "datasets";
        }
        if (value.startsWith("alert_")) {
            return "alerts";
        }
        if (value.startsWith("archive_")) {
            return "archive";
        }
        return "other";
    }
}

package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.JobService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.validation.Validator;
import org.springframework.beans.factory.annotation.Value;
import org.apache.pulsar.client.api.Consumer;
import org.apache.pulsar.client.api.Message;
import org.apache.pulsar.client.api.PulsarClient;
import org.apache.pulsar.client.api.Producer;
import org.apache.pulsar.client.api.SubscriptionType;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Placeholder listener for Pulsar-based ingest events.  Implementation deferred
 * until Phase 2 broker parity is executed.  The eventual listener will be
 * annotated with @PulsarListener (or equivalent) and share behavior with the
 * KafkaIngestListener.
 */
@Component
public class PulsarIngestListener {
    private static final Logger log = LoggerFactory.getLogger(PulsarIngestListener.class);
    private final JobService jobService;
    private final ObjectMapper mapper;
    private final Validator validator;

    @Value("${pulsar.serviceUrl:pulsar://localhost:6650}")
    private String serviceUrl;

    private PulsarClient client;
    private Consumer<String> consumer;
    private Producer<String> dlqProducer;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public PulsarIngestListener(JobService jobService, ObjectMapper mapper, Validator validator) {
        this.jobService = jobService;
        this.mapper = mapper;
        this.validator = validator;
    }

    @PostConstruct
    public void start() {
        try {
            client = PulsarClient.builder().serviceUrl(serviceUrl).build();
            consumer = client.newConsumer(org.apache.pulsar.client.api.Schema.STRING)
                    .topic("phase2-events")
                    .subscriptionName("governance-subscription")
                    .subscriptionType(SubscriptionType.Shared)
                    .subscribe();
            dlqProducer = client.newProducer(org.apache.pulsar.client.api.Schema.STRING)
                    .topic("phase2-events-dlq")
                    .create();

            running.set(true);
            Thread t = new Thread(this::runLoop, "pulsar-ingest-listener");
            t.setDaemon(true);
            t.start();
        } catch (Exception e) {
            log.error("Failed to start Pulsar listener", e);
        }
    }

    private void runLoop() {
        while (running.get()) {
            try {
                Message<String> msg = consumer.receive();
                try {
                    onMessage(msg.getValue());
                    consumer.acknowledge(msg);
                } catch (Exception ex) {
                    log.warn("Error processing Pulsar message, sending to DLQ", ex);
                    dlqProducer.send(msg.getValue());
                    consumer.acknowledge(msg);
                }
            } catch (Exception e) {
                log.error("Pulsar receive error", e);
            }
        }
    }

    @PreDestroy
    public void stop() {
        running.set(false);
        try {
            if (consumer != null) consumer.close();
            if (dlqProducer != null) dlqProducer.close();
            if (client != null) client.close();
        } catch (Exception ignored) {
        }
    }

    public void onMessage(String payload) {
        try {
            Map<String,Object> obj = mapper.readValue(payload, Map.class);
            String workflow = obj.containsKey("workflow") ? String.valueOf(obj.get("workflow")) : "ingest";
            String datasetId = obj.containsKey("datasetId") ? String.valueOf(obj.get("datasetId")) : "unknown";
            Map<String,Object> params = obj.containsKey("parameters") && obj.get("parameters") instanceof Map ? (Map<String,Object>) obj.get("parameters") : Map.of();
            String requestedBy = obj.containsKey("requestedBy") ? String.valueOf(obj.get("requestedBy")) : "pulsar-ingest";
            Map<String,Object> manifest = obj.containsKey("manifest") && obj.get("manifest") instanceof Map ? (Map<String,Object>) obj.get("manifest") : null;
            Map<String,Object> lineage = obj.containsKey("lineage") && obj.get("lineage") instanceof Map ? (Map<String,Object>) obj.get("lineage") : null;

            com.cosmic.governance.api.dto.JobSubmitRequest req = new com.cosmic.governance.api.dto.JobSubmitRequest(workflow, datasetId, params, lineage, manifest, requestedBy);
            Set<jakarta.validation.ConstraintViolation<com.cosmic.governance.api.dto.JobSubmitRequest>> violations = validator.validate(req);
            if (!violations.isEmpty()) {
                log.warn("Pulsar message failed validation: {}", violations);
                throw new IllegalArgumentException("Pulsar message validation failed: " + violations);
            }

            log.info("Received Pulsar event for workflow={} datasetId={}", workflow, datasetId);
            jobService.submit(req);
        } catch (Exception ex) {
            log.warn("Failed to process Pulsar message: {}", ex.toString());
            throw new RuntimeException(ex);
        }
    }
}

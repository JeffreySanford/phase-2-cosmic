package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.GovernanceIngestMetricsService;
import com.cosmic.governance.api.service.GovernanceIngestProcessingService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.apache.pulsar.client.api.Consumer;
import org.apache.pulsar.client.api.Message;
import org.apache.pulsar.client.api.Producer;
import org.apache.pulsar.client.api.PulsarClient;
import org.apache.pulsar.client.api.PulsarClientException;
import org.apache.pulsar.client.api.Schema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Component
public class PulsarIngestListener {
    private static final Logger log = LoggerFactory.getLogger(PulsarIngestListener.class);
    private static final String BROKER = "pulsar";

    @Value("${pulsar.service.url:pulsar://localhost:6650}")
    private String pulsarServiceUrl;

    @Value("${governance.pulsar.ingest.topic:phase2-events}")
    private String ingestTopic;

    @Value("${governance.pulsar.ingest.subscription:governance-ingest}")
    private String subscriptionName;

    @Value("${governance.pulsar.ingest.dlq-topic:phase2-events-dlq}")
    private String dlqTopic;

    private final GovernanceIngestMetricsService ingestMetrics;
    private final GovernanceIngestProcessingService ingestProcessor;

    private ExecutorService executor;
    private PulsarClient client;
    private Consumer<byte[]> consumer;
    private Producer<byte[]> dlqProducer;
    private volatile boolean running;

    public PulsarIngestListener(
            GovernanceIngestMetricsService ingestMetrics,
            GovernanceIngestProcessingService ingestProcessor
    ) {
        this.ingestMetrics = ingestMetrics;
        this.ingestProcessor = ingestProcessor;
    }

    @PostConstruct
    void start() {
        executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "pulsar-ingest-listener");
            t.setDaemon(true);
            return t;
        });
        running = true;
        executor.submit(this::runLoop);
    }

    private void runLoop() {
        try {
            client = PulsarClient.builder().serviceUrl(pulsarServiceUrl).build();
            consumer = client.newConsumer(Schema.BYTES)
                    .topic(ingestTopic)
                    .subscriptionName(subscriptionName)
                    .subscribe();
            dlqProducer = client.newProducer(Schema.BYTES)
                    .topic(dlqTopic)
                    .create();
            log.info("Connected Pulsar ingest listener topic={} subscription={}", ingestTopic, subscriptionName);
            while (running) {
                Message<byte[]> message = consumer.receive();
                String payload = new String(message.getData(), StandardCharsets.UTF_8);
                try {
                    var result = ingestProcessor.process(BROKER, ingestTopic, payload);
                    if (result.duplicate()) {
                        log.info("Ignored duplicate Pulsar ingest event for workflow={} datasetId={}", result.workflow(), result.datasetId());
                    }
                    consumer.acknowledge(message);
                } catch (Exception ex) {
                    ingestMetrics.recordDlqForward(BROKER, ingestTopic, "ingest");
                    safeSendDlq(message.getData());
                    consumer.acknowledge(message);
                    log.warn("Failed to process Pulsar message: {}", ex.toString());
                }
            }
        } catch (Exception ex) {
            log.warn("Pulsar ingest listener unavailable for {}: {}", pulsarServiceUrl, ex.toString());
        }
    }

    private void safeSendDlq(byte[] payload) {
        try {
            if (dlqProducer != null) {
                dlqProducer.send(payload);
            }
        } catch (PulsarClientException e) {
            log.warn("Failed to publish Pulsar ingest payload to DLQ {}: {}", dlqTopic, e.toString());
        }
    }

    @PreDestroy
    void stop() {
        running = false;
        if (executor != null) {
            executor.shutdownNow();
        }
        closeQuietly(consumer);
        closeQuietly(dlqProducer);
        closeQuietly(client);
    }

    private void closeQuietly(AutoCloseable closeable) {
        if (closeable == null) {
            return;
        }
        try {
            closeable.close();
        } catch (Exception ignored) {
            return;
        }
    }
}

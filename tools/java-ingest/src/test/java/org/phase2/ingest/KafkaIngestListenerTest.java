package org.phase2.ingest;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;

class KafkaIngestListenerTest {

    @Test
    void suppressesDuplicateAfterSuccessfulForward() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe);
        var record = record("event-001", "us-west");

        when(forwarder.isConfigured()).thenReturn(true);
        when(forwarder.forward(eq("kafka"), eq("phase2-events"), anyString(), anyMap())).thenReturn(true);

        listener.onMessage(record);
        listener.onMessage(record);

        verify(forwarder, times(1)).forward(eq("kafka"), eq("phase2-events"), anyString(), anyMap());
        verify(metrics).recordDuplicate("phase2-events");
    }

    @Test
    void throwsWhenConfiguredForwardingFailsSoRetryInfrastructureCanOwnDelivery() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe);
        var record = record("event-002", "us-east");

        when(forwarder.isConfigured()).thenReturn(true);
        when(forwarder.forward(eq("kafka"), eq("phase2-events"), anyString(), anyMap())).thenReturn(false);

        assertThatThrownBy(() -> listener.onMessage(record))
                .isInstanceOf(KafkaIngestListener.ServerApiForwardingException.class)
                .hasMessageContaining("event-002");

        verify(metrics, never()).recordForwarded(anyString());
    }

    @Test
    void dltHandlerRecordsRetryExhaustion() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe);
        var record = record("event-003", "us-central");

        listener.onDeadLetter(record);

        verify(metrics).recordForwardDeadLetter("phase2-events", "event-003");
    }

    private ConsumerRecord<String, String> record(String eventId, String region) {
        var record = new ConsumerRecord<String, String>(
                "phase2-events.forward-retry-1000",
                0,
                10L,
                null,
                "{\"source\":\"main\",\"eventType\":\"telemetry.batch\",\"traceId\":\"trace-test\"}"
        );
        record.headers().add("event-id", eventId.getBytes(StandardCharsets.UTF_8));
        record.headers().add("collector-region", region.getBytes(StandardCharsets.UTF_8));
        record.headers().add("collector-kafka-topic", "phase2-events".getBytes(StandardCharsets.UTF_8));
        record.headers().add("collector-pulsar-message-id", "pulsar-123".getBytes(StandardCharsets.UTF_8));
        return record;
    }
}

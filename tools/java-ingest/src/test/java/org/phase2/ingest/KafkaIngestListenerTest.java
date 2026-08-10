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
        var quarantine = mock(ValidationDeadLetterPublisher.class);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe, quarantine);
        var record = record("event-001", "us-west");

        when(forwarder.isConfigured()).thenReturn(true);
        when(forwarder.forward(eq("kafka"), eq("phase2-events"), anyString(), anyMap())).thenReturn(true);

        listener.onMessage(record);
        listener.onMessage(record);

        verify(forwarder, times(1)).forward(eq("kafka"), eq("phase2-events"), anyString(), anyMap());
        verify(metrics).recordDuplicate("phase2-events");
        verifyNoValidationQuarantine(quarantine);
    }

    @Test
    void doesNotReportDuplicatesWhenForwardingIsDisabled() {
        // Duplicate suppression protects the forward side effect. With forwarding
        // off there is no side effect, the cache is never populated, and a
        // duplicate metric here would be misleading rather than informative.
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var quarantine = mock(ValidationDeadLetterPublisher.class);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe, quarantine);
        var record = record("event-metrics-only", "us-west");

        when(forwarder.isConfigured()).thenReturn(false);

        listener.onMessage(record);
        listener.onMessage(record);

        verify(forwarder, never()).forward(anyString(), anyString(), anyString(), anyMap());
        verify(metrics, never()).recordDuplicate(anyString());
        verifyNoValidationQuarantine(quarantine);
    }

    @Test
    void throwsWhenConfiguredForwardingFailsSoRetryInfrastructureCanOwnDelivery() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var quarantine = mock(ValidationDeadLetterPublisher.class);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe, quarantine);
        var record = record("event-002", "us-east");

        when(forwarder.isConfigured()).thenReturn(true);
        when(forwarder.forward(eq("kafka"), eq("phase2-events"), anyString(), anyMap())).thenReturn(false);

        assertThatThrownBy(() -> listener.onMessage(record))
                .isInstanceOf(KafkaIngestListener.ServerApiForwardingException.class)
                .hasMessageContaining("event-002");

        verify(metrics, never()).recordForwarded(anyString());
        verifyNoValidationQuarantine(quarantine);
    }

    @Test
    void blankPayloadGoesDirectlyToValidationDltWithoutHttpForward() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var quarantine = mock(ValidationDeadLetterPublisher.class);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe, quarantine);
        var record = record("event-invalid", "us-west", "   ");

        listener.onMessage(record);

        verify(quarantine).publish(record, "missing_payload");
        verify(metrics).recordValidationDeadLetter("phase2-events", "missing_payload");
        verify(forwarder, never()).forward(anyString(), anyString(), anyString(), anyMap());
    }

    @Test
    void missingEventIdGoesDirectlyToValidationDltWithoutHttpForward() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var quarantine = mock(ValidationDeadLetterPublisher.class);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe, quarantine);
        var record = record(null, "us-west");

        listener.onMessage(record);

        verify(quarantine).publish(record, "missing_event_id");
        verify(metrics).recordValidationDeadLetter("phase2-events", "missing_event_id");
        verify(forwarder, never()).forward(anyString(), anyString(), anyString(), anyMap());
    }

    @Test
    void dltHandlerRecordsRetryExhaustion() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = mock(ServerApiForwarder.class);
        var dedupe = new EventDeduplicationService(100);
        var quarantine = mock(ValidationDeadLetterPublisher.class);
        var listener = new KafkaIngestListener(metrics, forwarder, dedupe, quarantine);
        var record = record("event-003", "us-central");

        listener.onDeadLetter(record);

        verify(metrics).recordForwardDeadLetter("phase2-events", "event-003");
    }

    private void verifyNoValidationQuarantine(ValidationDeadLetterPublisher quarantine) {
        verify(quarantine, never()).publish(
                org.mockito.ArgumentMatchers.any(),
                anyString()
        );
    }

    private ConsumerRecord<String, String> record(String eventId, String region) {
        return record(
                eventId,
                region,
                "{\"source\":\"main\",\"eventType\":\"telemetry.batch\",\"traceId\":\"trace-test\"}"
        );
    }

    private ConsumerRecord<String, String> record(String eventId, String region, String payload) {
        var record = new ConsumerRecord<String, String>(
                "phase2-events.forward-retry-1000",
                0,
                10L,
                null,
                payload
        );
        if (eventId != null) {
            record.headers().add("event-id", eventId.getBytes(StandardCharsets.UTF_8));
        }
        record.headers().add("collector-region", region.getBytes(StandardCharsets.UTF_8));
        record.headers().add("collector-kafka-topic", "phase2-events".getBytes(StandardCharsets.UTF_8));
        record.headers().add("collector-pulsar-message-id", "pulsar-123".getBytes(StandardCharsets.UTF_8));
        return record;
    }
}

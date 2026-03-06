package com.cosmic.governance.api.service;

import com.cosmic.governance.api.config.RabbitMQConfig;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AuditServiceTest {

    @Test
    void mirrorAuditEventPublishesToAuditExchange() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        AuditService service = new AuditService(rabbitTemplate);

        service.mirrorAuditEvent("job completed");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(rabbitTemplate).convertAndSend(
                org.mockito.Mockito.eq(RabbitMQConfig.AUDIT_EXCHANGE),
                org.mockito.Mockito.eq("audit.mirrored"),
                payloadCaptor.capture()
        );

        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals("kafka", payload.get("source"));
        assertEquals("audit", payload.get("eventType"));
        assertEquals("job completed", payload.get("payload"));
        assertNotNull(payload.get("timestamp"));
    }

    @Test
    void publishJobEventWrapsJobDetailsInControlEvent() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        AuditService service = new AuditService(rabbitTemplate);

        service.publishJobEvent("job-1", "submitted", Map.of("workflow", "continuum"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(rabbitTemplate).convertAndSend(
                org.mockito.Mockito.eq(RabbitMQConfig.CONTROL_EXCHANGE),
                org.mockito.Mockito.eq("control.job.submitted"),
                payloadCaptor.capture()
        );

        Map<String, Object> controlEvent = payloadCaptor.getValue();
        assertEquals("governance-api", controlEvent.get("source"));
        assertEquals("job.submitted", controlEvent.get("eventType"));
        assertNotNull(controlEvent.get("timestamp"));

        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) controlEvent.get("payload");
        assertEquals("job-1", payload.get("jobId"));
        assertEquals("submitted", payload.get("eventType"));
        @SuppressWarnings("unchecked")
        Map<String, Object> details = (Map<String, Object>) payload.get("details");
        assertTrue(details.containsKey("workflow"));
        assertEquals("continuum", details.get("workflow"));
    }
}

package org.phase2.ingest;

import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * Forwards consumed events to the server API.
 *
 * <p>This is the hop that turns java-ingest from a terminal metrics sidecar into
 * a real pipeline stage:
 *
 * <pre>
 * generator -&gt; Pulsar -&gt; collector -&gt; Kafka -&gt; java-ingest -&gt; server API -&gt; SSE -&gt; frontend
 * </pre>
 *
 * <p>Each HTTP attempt is bounded by a timeout. The listener owns durable retry
 * semantics: a failed attempt is thrown into Kafka retry topics and, after the
 * configured attempts are exhausted, into the forward DLT. Kafka therefore
 * remains the durable record rather than an in-memory HTTP retry queue.
 */
@Component
public class ServerApiForwarder {

    private static final Logger log = LoggerFactory.getLogger(ServerApiForwarder.class);

    private final RestTemplate restTemplate;
    private final IngestMetricsService metricsService;
    private final String endpoint;
    private final boolean enabled;

    public ServerApiForwarder(
            IngestMetricsService metricsService,
            @Value("${ingest.forward.url:}") String endpoint,
            @Value("${ingest.forward.enabled:true}") boolean enabled,
            @Value("${ingest.forward.timeout-ms:2000}") long timeoutMs) {
        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(timeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(timeoutMs));

        this.restTemplate = new RestTemplate(requestFactory);
        this.metricsService = metricsService;
        this.endpoint = endpoint;
        this.enabled = enabled;

        if (enabled && (endpoint == null || endpoint.isBlank())) {
            log.warn("Server API forwarding is enabled but ingest.forward.url is not set; events will not be forwarded");
        }
    }

    /** @return true when the event was accepted by the server API. */
    public boolean forward(String broker, String topic, String payload) {
        return forward(broker, topic, payload, Collections.emptyMap());
    }

    /**
     * Forwards one event with transport attribution preserved as explicit
     * envelope fields. eventId is also copied into a structured JSON payload so
     * the SSE/Angular boundary can deduplicate without depending on Kafka headers.
     */
    public boolean forward(
            String broker,
            String topic,
            String payload,
            Map<String, String> attribution) {
        if (!isConfigured()) {
            return false;
        }

        Map<String, Object> body = buildBody(broker, topic, payload, attribution);

        try {
            var headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            restTemplate.postForEntity(endpoint, new org.springframework.http.HttpEntity<>(body, headers), String.class);
            return true;
        } catch (RestClientException ex) {
            metricsService.recordForwardFailure(broker, topic, ex.getClass().getSimpleName());
            log.warn("Failed to forward event to server API {}: {}", endpoint, ex.toString());
            return false;
        }
    }

    Map<String, Object> buildBody(
            String broker,
            String topic,
            String payload,
            Map<String, String> attribution) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("broker", broker);
        body.put("topic", topic);

        Object parsedPayload = parseOrRaw(payload);
        body.put("payload", enrichPayloadWithEventId(parsedPayload, attribution.get("eventId")));

        putIfPresent(body, "eventId", attribution.get("eventId"));
        putIfPresent(body, "collectorRegion", attribution.get("collectorRegion"));
        putIfPresent(body, "pulsarMessageId", attribution.get("pulsarMessageId"));
        putIfPresent(body, "collectorForwardedAt", attribution.get("collectorForwardedAt"));
        return body;
    }

    public boolean isConfigured() {
        return enabled && endpoint != null && !endpoint.isBlank();
    }

    private Object enrichPayloadWithEventId(Object payload, String eventId) {
        if (!(payload instanceof Map<?, ?> sourceMap) || eventId == null || eventId.isBlank()) {
            return payload;
        }

        Map<String, Object> enriched = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : sourceMap.entrySet()) {
            if (entry.getKey() instanceof String key) {
                enriched.put(key, entry.getValue());
            }
        }
        enriched.putIfAbsent("eventId", eventId);
        return enriched;
    }

    private void putIfPresent(Map<String, Object> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }

    /**
     * Sends structured JSON when the payload is JSON, and the raw string when it
     * is not, so a malformed payload is still visible downstream instead of
     * being dropped.
     */
    private Object parseOrRaw(String payload) {
        if (payload == null) {
            return null;
        }
        String trimmed = payload.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                return new com.fasterxml.jackson.databind.ObjectMapper().readValue(trimmed, Object.class);
            } catch (Exception ex) {
                return payload;
            }
        }
        return payload;
    }
}

package org.phase2.ingest;

import java.time.Duration;
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
 * <p>Forwarding is best-effort by design. Kafka remains the durable record, so a
 * server API outage must not stop consumption or block the partition. Failures
 * are counted rather than retried in-line.
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
        // Timeouts are set on the request factory rather than through
        // RestTemplateBuilder, whose timeout setters have moved across Spring
        // Boot versions. A bounded timeout matters here: the consumer thread
        // must not block on an unresponsive server API.
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
        if (!isConfigured()) {
            return false;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("broker", broker);
        body.put("topic", topic);
        body.put("payload", parseOrRaw(payload));

        try {
            var headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            restTemplate.postForEntity(endpoint, new org.springframework.http.HttpEntity<>(body, headers), String.class);
            return true;
        } catch (RestClientException ex) {
            // Kafka still holds the durable record, so a forwarding failure is
            // recorded and the consumer continues rather than blocking ingest.
            metricsService.recordForwardFailure(broker, topic, ex.getClass().getSimpleName());
            log.warn("Failed to forward event to server API {}: {}", endpoint, ex.toString());
            return false;
        }
    }

    public boolean isConfigured() {
        return enabled && endpoint != null && !endpoint.isBlank();
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

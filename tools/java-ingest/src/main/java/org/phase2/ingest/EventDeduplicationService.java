package org.phase2.ingest;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Bounded process-local suppression of already delivered event IDs.
 *
 * <p>The source of truth remains Kafka and delivery remains at-least-once. This
 * cache prevents the common duplicate created when the Pulsar-to-Kafka bridge
 * redelivers around its ACK boundary, without pretending to provide global
 * exactly-once semantics across service restarts.
 */
@Service
public class EventDeduplicationService {

    private final Map<String, Boolean> delivered;

    public EventDeduplicationService(@Value("${ingest.dedupe.max-entries:10000}") int maxEntries) {
        int boundedMaxEntries = Math.max(1, maxEntries);
        this.delivered = new LinkedHashMap<>(128, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
                return size() > boundedMaxEntries;
            }
        };
    }

    public synchronized boolean wasDelivered(String eventId) {
        return eventId != null && !eventId.isBlank() && delivered.containsKey(eventId);
    }

    public synchronized void markDelivered(String eventId) {
        if (eventId != null && !eventId.isBlank()) {
            delivered.put(eventId, Boolean.TRUE);
        }
    }

    synchronized int sizeForTest() {
        return delivered.size();
    }
}

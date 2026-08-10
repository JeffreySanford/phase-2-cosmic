package org.phase2.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EventDeduplicationServiceTest {

    @Test
    void recordsDeliveredEventIds() {
        var dedupe = new EventDeduplicationService(10);

        assertThat(dedupe.wasDelivered("event-1")).isFalse();
        dedupe.markDelivered("event-1");
        assertThat(dedupe.wasDelivered("event-1")).isTrue();
    }

    @Test
    void boundsTheCache() {
        var dedupe = new EventDeduplicationService(2);

        dedupe.markDelivered("event-1");
        dedupe.markDelivered("event-2");
        dedupe.markDelivered("event-3");

        assertThat(dedupe.sizeForTest()).isEqualTo(2);
        assertThat(dedupe.wasDelivered("event-1")).isFalse();
        assertThat(dedupe.wasDelivered("event-2")).isTrue();
        assertThat(dedupe.wasDelivered("event-3")).isTrue();
    }
}

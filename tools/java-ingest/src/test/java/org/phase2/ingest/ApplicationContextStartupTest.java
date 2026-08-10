package org.phase2.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.test.context.TestPropertySource;

/**
 * Proves the application context actually starts with the retry-topic
 * infrastructure enabled.
 *
 * <p>{@code @EnableKafkaRetryTopic} requires a {@link TaskScheduler} to schedule
 * back-off between non-blocking retry attempts. Without one, startup fails with
 * "Either a RetryTopicSchedulerWrapper or TaskScheduler bean is required" — the
 * application does not boot at all.
 *
 * <p>The unit tests all passed while the container was crash-looping, because
 * they never build the full context. This test closes that gap.
 */
@SpringBootTest
@TestPropertySource(
        properties = {
                "ingest.forward.url=http://localhost:4000/api/ingest/events",
                "spring.kafka.bootstrap-servers=localhost:9092"
        }
)
class ApplicationContextStartupTest {

    @Autowired
    private TaskScheduler taskScheduler;

    @Autowired
    private ServerApiForwarder forwarder;

    @Test
    void contextStartsWithRetryTopicInfrastructure() {
        // Reaching this point means the retry-topic configuration bootstrapped.
        assertThat(taskScheduler).isNotNull();
        assertThat(forwarder.isConfigured()).isTrue();
    }
}

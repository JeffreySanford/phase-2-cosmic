package org.phase2.ingest;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.kafka.annotation.EnableKafkaRetryTopic;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@EnableKafkaRetryTopic
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    /**
     * Required by {@code @EnableKafkaRetryTopic}.
     *
     * <p>Non-blocking retry topics schedule the back-off between attempts, and
     * Spring Kafka fails startup with "Either a RetryTopicSchedulerWrapper or
     * TaskScheduler bean is required" when none is present. Without this the
     * application does not boot at all, so the retry topology is not merely
     * inactive — it is fatal.
     */
    @Bean
    public TaskScheduler retryTopicTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("ingest-retry-");
        scheduler.setDaemon(true);
        return scheduler;
    }

    @RestController
    static class HealthController {
        @GetMapping("/health")
        public String health() { return "ok"; }
    }
}

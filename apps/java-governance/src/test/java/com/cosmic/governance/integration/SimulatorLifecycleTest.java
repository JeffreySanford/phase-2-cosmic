package com.cosmic.governance.integration;

import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.service.JobService;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import java.util.Map;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.RedisTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

import com.cosmic.governance.test.AbstractRedisTest;

@SpringBootTest
@Testcontainers
public class SimulatorLifecycleTest extends AbstractRedisTest {

    @Autowired
    private JobService jobService;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private RedisMarshaller marshaller;

    @Test
    public void simulatorJobShouldPassThroughRunningState() throws Exception {
        // submit a job and verify state transitions produced by the simulator executor
        JobSubmitRequest req = new JobSubmitRequest("foo", "ds", Map.of(), null, null, "tester");
        var resp = jobService.submit(req);
        assertThat(resp).isNotNull();
        String jobId = resp.jobId();
        String key = "job:" + jobId;

        JobRecord initial = marshaller.toJobRecord(redisTemplate.opsForValue().get(key));
        assertThat(initial).isNotNull();
        assertThat(initial.getState()).isIn(JobState.QUEUED, JobState.RUNNING, JobState.COMPLETED);

        Awaitility.await().atMost(Duration.ofSeconds(3)).untilAsserted(() -> {
            JobRecord runningOrCompleted = marshaller.toJobRecord(redisTemplate.opsForValue().get(key));
            assertThat(runningOrCompleted).isNotNull();
            assertThat(jobService.getLogs(jobId))
                    .anyMatch(log -> log.contains("Simulator: job running"));
            assertThat(runningOrCompleted.getState()).isIn(JobState.RUNNING, JobState.COMPLETED);
        });

        Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> {
            JobRecord completed = marshaller.toJobRecord(redisTemplate.opsForValue().get(key));
            assertThat(completed).isNotNull();
            assertThat(completed.getState()).isEqualTo(JobState.COMPLETED);
        });
    }
}

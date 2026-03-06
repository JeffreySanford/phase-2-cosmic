package com.cosmic.governance.integration;

import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.service.JobService;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.junit.jupiter.api.Test;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.RedisTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

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
        assumeTrue(isRedisAvailable(), "Redis unavailable for simulator lifecycle test");

        // submit a job and verify state transitions produced by the simulator executor
        JobSubmitRequest req = new JobSubmitRequest("foo", "ds", Map.of(), null, null, "tester");
        var resp = jobService.submit(req);
        assertThat(resp).isNotNull();
        String jobId = resp.jobId();
        String key = "job:" + jobId;

        // initially queued
        Thread.sleep(500);
        JobRecord rec = marshaller.toJobRecord(redisTemplate.opsForValue().get(key));
        assertThat(rec).isNotNull();
        assertThat(rec.getState()).isEqualTo(JobState.QUEUED);

        // after 3 seconds the executor should have moved to RUNNING
        Thread.sleep(3000);
        rec = marshaller.toJobRecord(redisTemplate.opsForValue().get(key));
        assertThat(rec).isNotNull();
        assertThat(rec.getState()).isEqualTo(JobState.RUNNING);

        // and later it should complete
        Thread.sleep(5000);
        rec = marshaller.toJobRecord(redisTemplate.opsForValue().get(key));
        assertThat(rec).isNotNull();
        assertThat(rec.getState()).isEqualTo(JobState.COMPLETED);
    }

    private boolean isRedisAvailable() {
        try {
            String response = redisTemplate.getConnectionFactory().getConnection().ping();
            return response != null;
        } catch (Exception ex) {
            return false;
        }
    }
}

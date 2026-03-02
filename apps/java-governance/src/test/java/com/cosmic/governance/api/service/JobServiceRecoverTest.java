package com.cosmic.governance.api.service;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.service.JobService;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.redis.DataRedisTest;
import org.springframework.data.redis.core.RedisTemplate;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@DataRedisTest
class JobServiceRecoverTest {

    @Autowired
    RedisTemplate<String, Object> redisTemplate;

    @Autowired
    RedisMarshaller marshaller;

    JobService service;

    @BeforeEach
    void setup() {
        service = new JobService(redisTemplate, null, null, marshaller);
    }

    @Test
    void recoverShouldCompleteRunningSimulatorJob() {
        // insert a running job record with executor simulator
        String jobId = "test-job";
        JobRecord rec = new JobRecord(jobId, "wf", "ds", JobState.RUNNING,
                Instant.now().toString(), Instant.now().toString(),
                Map.of("executor", "simulator"), "tester");
        redisTemplate.opsForValue().set("job:" + jobId, rec);

        service.completeStaleRunningJobs();

        Object o = redisTemplate.opsForValue().get("job:" + jobId);
        JobRecord updated = marshaller.toJobRecord(o);
        assertThat(updated).isNotNull();
        assertThat(updated.getState()).isEqualTo(JobState.COMPLETED);
    }

    @Test
    void dispatchQueuedMovesJobToRunning() throws InterruptedException {
        String jobId = "queued-job";
        JobRecord rec = new JobRecord(jobId, "wf", "ds", JobState.QUEUED,
                Instant.now().toString(), Instant.now().toString(),
                Map.of("executor", "simulator"), "tester");
        redisTemplate.opsForValue().set("job:" + jobId, rec);

        // run the dispatch scan manually
        service.dispatchQueuedJobs();
        // simulator executor updates state to RUNNING after ~2s
        Thread.sleep(3500);

        Object o = redisTemplate.opsForValue().get("job:" + jobId);
        JobRecord updated = marshaller.toJobRecord(o);
        assertThat(updated).isNotNull();
        assertThat(updated.getState()).isEqualTo(JobState.RUNNING);
    }
}

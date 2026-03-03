package com.cosmic.governance.api.service;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.service.JobService;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.cosmic.governance.api.executor.JobExecutor;
import org.springframework.data.redis.core.RedisTemplate;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class JobServiceRecoverTest {

    RedisMarshaller marshaller;

    JobService service;

    @BeforeEach
    void setup() {
        marshaller = new RedisMarshaller(new ObjectMapper());
        service = new JobService(null, new ObjectMapper(), null, marshaller);
        // register a lightweight test-only simulator executor so dispatchQueuedJobs() can move QUEUED->RUNNING
        JobExecutor simExec = new JobExecutor() {
            @Override
            public String name() { return "simulator"; }

            @Override
            public void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate) {
                record.setState(JobState.RUNNING);
                record.setUpdatedAt(Instant.now().toString());
                record.setVersion(record.getVersion() + 1);
                // persist via the service backing store
                service.putRaw("job:" + record.getJobId(), record);
            }
        };
        try {
            java.lang.reflect.Field f = JobService.class.getDeclaredField("executorMap");
            f.setAccessible(true);
            @SuppressWarnings("unchecked")
            java.util.Map<String, JobExecutor> map = (java.util.Map<String, JobExecutor>) f.get(service);
            map.put(simExec.name(), simExec);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void recoverShouldCompleteRunningSimulatorJob() {
        // insert a running job record with executor simulator
        String jobId = "test-job";
        JobRecord rec = new JobRecord(jobId, "wf", "ds", JobState.RUNNING,
                Instant.now().toString(), Instant.now().toString(),
                Map.of("executor", "simulator"), "tester");
        service.putRaw("job:" + jobId, rec);

        service.completeStaleRunningJobs();

        Object o = service.getRaw("job:" + jobId);
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
        service.putRaw("job:" + jobId, rec);

        // run the dispatch scan manually
        service.dispatchQueuedJobs();
        // simulator executor updates state to RUNNING after ~2s
        Thread.sleep(3500);

        Object o = service.getRaw("job:" + jobId);
        JobRecord updated = marshaller.toJobRecord(o);
        assertThat(updated).isNotNull();
        assertThat(updated.getState()).isEqualTo(JobState.RUNNING);
    }
}

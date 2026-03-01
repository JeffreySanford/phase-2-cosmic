package com.cosmic.governance.api.executor;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class SimulatorExecutor implements JobExecutor {
    private static final ScheduledExecutorService EXEC = Executors.newScheduledThreadPool(2);

    @Override
    public String name() { return "simulator"; }

    @Override
    public void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate) {
        String jobKey = "job:" + record.getJobId();
        // schedule running
        EXEC.schedule(() -> {
            Object o = redisTemplate.opsForValue().get(jobKey);
            if (o instanceof JobRecord) {
                JobRecord r = (JobRecord) o;
                r.setState(JobState.RUNNING);
                r.setUpdatedAt(Instant.now().toString());
                var newParams = r.getParameters() == null ? new java.util.HashMap<String, Object>() : new java.util.HashMap<String, Object>(r.getParameters());
                newParams.put("externalJobId", "sim-" + UUID.randomUUID());
                newParams.put("executor", name());
                r.setParameters(newParams);
                redisTemplate.opsForValue().set(jobKey, r);
                // push a running log
                redisTemplate.opsForList().rightPush(jobKey + ":logs", "Simulator: job running");
            }
        }, 2, TimeUnit.SECONDS);

        EXEC.schedule(() -> {
            Object o = redisTemplate.opsForValue().get(jobKey);
            if (o instanceof JobRecord) {
                JobRecord r = (JobRecord) o;
                r.setState(JobState.COMPLETED);
                r.setUpdatedAt(Instant.now().toString());
                var newParams = r.getParameters() == null ? new java.util.HashMap<String, Object>() : new java.util.HashMap<String, Object>(r.getParameters());
                newParams.put("completedAt", Instant.now().toString());
                r.setParameters(newParams);
                redisTemplate.opsForValue().set(jobKey, r);
                redisTemplate.opsForList().rightPush(jobKey + ":logs", "Simulator: job completed");
                // create a small artifact marker and write a file to tmp artifact store
                String artKey = jobKey + ":artifacts";
                String name = "result.txt";
                var artifact = Map.of("name", name, "url", "/api/v1/jobs/" + r.getJobId() + "/artifacts/" + name);
                redisTemplate.opsForValue().set(artKey, artifact);
                try {
                    java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r.getJobId());
                    java.nio.file.Files.createDirectories(base);
                    java.nio.file.Path file = base.resolve(name);
                    java.nio.file.Files.writeString(file, "Simulator artifact for job " + r.getJobId() + "\nOK\n");
                } catch (Exception ignored) {}
            }
        }, 6, TimeUnit.SECONDS);
    }
}

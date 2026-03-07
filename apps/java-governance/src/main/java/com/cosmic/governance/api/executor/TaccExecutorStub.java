package com.cosmic.governance.api.executor;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class TaccExecutorStub implements JobExecutor {
    private final ScheduledExecutorService EXEC = Executors.newScheduledThreadPool(1);
    private final RedisMarshaller marshaller;

    public TaccExecutorStub(@Autowired RedisMarshaller marshaller) {
        this.marshaller = marshaller;
    }

    @Override
    public String name() { return "tacc"; }

    @Override
    public void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate) {
        String jobKey = "job:" + record.getJobId();
        // simulate network submission delay
        EXEC.schedule(() -> {
            Object o = redisTemplate.opsForValue().get(jobKey);
            JobRecord r = marshaller.toJobRecord(o);
            if (r == null) return;
            r.setState(JobState.RUNNING);
            r.setUpdatedAt(Instant.now().toString());
            var newParams = r.getParameters() == null ? new HashMap<String, Object>() : new HashMap<String, Object>(r.getParameters());
            // simulate external submission id and endpoint
            newParams.put("externalJobId", "tacc-" + UUID.randomUUID());
            newParams.put("executor", name());
            newParams.put("submittedTo", "https://tacc.example/sim");
            r.setParameters(newParams);
            redisTemplate.opsForValue().set(jobKey, r);
            redisTemplate.opsForList().rightPush(jobKey + ":logs", "TACC: submitted job to remote API");

            // simulate remote work and artifact creation
            EXEC.schedule(() -> {
                Object o2 = redisTemplate.opsForValue().get(jobKey);
                JobRecord r2 = marshaller.toJobRecord(o2);
                if (r2 == null) return;
                r2.setState(JobState.COMPLETED);
                r2.setUpdatedAt(Instant.now().toString());
                var p2 = r2.getParameters() == null ? new HashMap<String, Object>() : new HashMap<String, Object>(r2.getParameters());
                p2.put("completedAt", Instant.now().toString());
                r2.setParameters(p2);
                redisTemplate.opsForValue().set(jobKey, r2);
                redisTemplate.opsForList().rightPush(jobKey + ":logs", "TACC: remote job completed");
                String artKey = jobKey + ":artifacts";
                String name = "tacc-output.txt";
                var artifact = Map.of("name", name, "url", "/api/v1/jobs/" + r2.getJobId() + "/artifacts/" + name);
                redisTemplate.opsForValue().set(artKey, artifact);
                try {
                    java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r2.getJobId());
                    java.nio.file.Files.createDirectories(base);
                    java.nio.file.Path file = base.resolve(name);
                    java.nio.file.Files.writeString(file, "TACC stub artifact for job " + r2.getJobId() + "\nOK\n");
                } catch (Exception ignored) {}
            }, 4, TimeUnit.SECONDS);
        }, 2, TimeUnit.SECONDS);
    }
}

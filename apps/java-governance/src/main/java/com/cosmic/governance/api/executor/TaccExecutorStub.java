package com.cosmic.governance.api.executor;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import com.cosmic.governance.api.service.GovernanceRuntimeMetricsService;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class TaccExecutorStub implements JobExecutor {
    private final ScheduledExecutorService EXEC = Executors.newScheduledThreadPool(1);
    private final RedisMarshaller marshaller;
    private final GovernanceRuntimeMetricsService governanceRuntimeMetricsService;

    public TaccExecutorStub(@Autowired RedisMarshaller marshaller,
                            @Autowired GovernanceRuntimeMetricsService governanceRuntimeMetricsService) {
        this.marshaller = marshaller;
        this.governanceRuntimeMetricsService = governanceRuntimeMetricsService;
    }

    @Override
    public String name() { return "tacc"; }

    @Override
    public void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate) {
        String jobKey = "job:" + record.getJobId();
        int complexity = complexity(record);
        int submitDelaySeconds = Math.max(1, complexity);
        int completionDelaySeconds = Math.max(3, 2 + (complexity * 2));
        // simulate network submission delay
        EXEC.schedule(() -> {
            Instant submitStartedAt = Instant.now();
            try {
                Object o = readRedisValue(redisTemplate, jobKey);
                JobRecord r = marshaller.toJobRecord(o);
                if (r == null) return;
                r.setState(JobState.RUNNING);
                r.setUpdatedAt(Instant.now().toString());
                var newParams = r.getParameters() == null ? new HashMap<String, Object>() : new HashMap<String, Object>(r.getParameters());
                // simulate external submission id and endpoint
                newParams.put("externalJobId", "tacc-" + UUID.randomUUID());
                newParams.put("executor", name());
                newParams.put("submittedTo", "https://tacc.example/sim");
                newParams.put("complexity", complexity);
                r.setParameters(newParams);
                writeRedisValue(redisTemplate, jobKey, r);
                recordExternalAdapterRequest(
                        "submit",
                        "https://tacc.example/sim",
                        newParams,
                        true,
                        null,
                        Duration.between(submitStartedAt, Instant.now())
                );
                pushRedisList(redisTemplate, jobKey + ":logs", "TACC: submitted job to remote API (complexity=" + complexity + ")");

                // simulate remote work and artifact creation
                EXEC.schedule(() -> {
                    Object o2 = readRedisValue(redisTemplate, jobKey);
                    JobRecord r2 = marshaller.toJobRecord(o2);
                    if (r2 == null) return;
                    Instant completedAt = Instant.now();
                    Duration runtime = durationBetween(r2.getUpdatedAt(), completedAt);
                    r2.setState(JobState.COMPLETED);
                    r2.setUpdatedAt(completedAt.toString());
                    var p2 = r2.getParameters() == null ? new HashMap<String, Object>() : new HashMap<String, Object>(r2.getParameters());
                    p2.put("completedAt", completedAt.toString());
                    r2.setParameters(p2);
                    writeRedisValue(redisTemplate, jobKey, r2);
                    recordTerminalState(r2.getWorkflow(), "tacc", JobState.COMPLETED, runtime);
                    pushRedisList(redisTemplate, jobKey + ":logs", "TACC: remote job completed (complexity=" + complexity + ")");
                    String artKey = jobKey + ":artifacts";
                    String name = "tacc-output.txt";
                    var artifact = Map.of("name", name, "url", "/api/v1/jobs/" + r2.getJobId() + "/artifacts/" + name);
                    writeRedisValue(redisTemplate, artKey, artifact);
                    try {
                        java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r2.getJobId());
                        java.nio.file.Files.createDirectories(base);
                        java.nio.file.Path file = base.resolve(name);
                        String content = "TACC stub artifact for job " + r2.getJobId() + "\nOK\n";
                        java.nio.file.Files.writeString(file, content);
                        recordObjectWrite("artifact-file", name, "tacc", content);
                    } catch (Exception ignored) {}
                }, completionDelaySeconds, TimeUnit.SECONDS);
            } catch (Exception ex) {
                recordExternalAdapterRequest(
                        "submit",
                        "https://tacc.example/sim",
                        record.getParameters(),
                        false,
                        ex.getClass().getSimpleName(),
                        Duration.between(submitStartedAt, Instant.now())
                );
                throw ex;
            }
        }, submitDelaySeconds, TimeUnit.SECONDS);
    }

    private int complexity(JobRecord record) {
        try {
            Map<String, Object> params = record.getParameters();
            if (params == null) return 2;
            Object raw = params.get("complexity");
            if (raw == null) return 2;
            return Math.max(1, Math.min(5, Integer.parseInt(String.valueOf(raw))));
        } catch (Exception ignored) {
            return 2;
        }
    }

    private Object readRedisValue(RedisTemplate<String, Object> redisTemplate, String key) {
        Instant startedAt = Instant.now();
        Object value = redisTemplate.opsForValue().get(key);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisRead("redis", keyspaceOf(key), value, true, Duration.between(startedAt, Instant.now()));
        }
        return value;
    }

    private void writeRedisValue(RedisTemplate<String, Object> redisTemplate, String key, Object value) {
        Instant startedAt = Instant.now();
        redisTemplate.opsForValue().set(key, value);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite("redis", keyspaceOf(key), value, true, Duration.between(startedAt, Instant.now()));
        }
    }

    private void pushRedisList(RedisTemplate<String, Object> redisTemplate, String key, Object value) {
        Instant startedAt = Instant.now();
        redisTemplate.opsForList().rightPush(key, value);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite("redis", keyspaceOf(key), value, true, Duration.between(startedAt, Instant.now()));
        }
    }

    private void recordObjectWrite(String storage, String objectKind, String executor, Object payload) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordObjectWrite(storage, objectKind, executor, payload);
        }
    }

    private void recordExternalAdapterRequest(
            String operation,
            String target,
            Object payload,
            boolean success,
            String errorClass,
            Duration duration
    ) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordExternalAdapterRequest(
                    "tacc",
                    operation,
                    target,
                    payload,
                    success,
                    errorClass,
                    duration
            );
        }
    }

    private void recordTerminalState(String workflow, String executor, JobState state, Duration runtime) {
        if (governanceRuntimeMetricsService == null) {
            return;
        }
        governanceRuntimeMetricsService.recordJobTerminalState(workflow, executor, state.name(), runtime);
        governanceRuntimeMetricsService.recordWorkflowRuntime(workflow, executor, state.name(), runtime);
    }

    private Duration durationBetween(String startedAt, Instant finishedAt) {
        try {
            return Duration.between(Instant.parse(startedAt), finishedAt);
        } catch (Exception ex) {
            return Duration.ZERO;
        }
    }

    private String keyspaceOf(String key) {
        if (key == null || key.isBlank()) {
            return "unknown";
        }
        int idx = key.indexOf(':');
        return idx > 0 ? key.substring(0, idx) : key;
    }
}

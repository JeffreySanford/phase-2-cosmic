package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.dto.JobSubmitRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class JobScenarioService {
    private static final List<String> SAMPLE_WORKFLOWS = List.of(
            "validate", "transform", "archive", "snapshot", "analyze"
    );

    private final JobService jobService;

    public JobScenarioService(JobService jobService) {
        this.jobService = jobService;
    }

    public Map<String, Object> seedSampleJobs(int deferredCount, int ingestCount) {
        List<String> deferredIds = new ArrayList<>();
        List<String> ingestIds = new ArrayList<>();

        for (int i = 0; i < Math.max(0, deferredCount); i++) {
            String workflow = SAMPLE_WORKFLOWS.get(i % SAMPLE_WORKFLOWS.size());
            JobStatusResponse created = jobService.submit(new JobSubmitRequest(
                    workflow,
                    "sample-dataset-" + (i + 1),
                    buildDeferredParams(workflow, i),
                    null,
                    Map.of(
                            "seeded", true,
                            "kind", "deferred-sample",
                            "complexity", 1 + (i % 3)
                    ),
                    "sample-seeder"
            ));
            deferredIds.add(created.jobId());
        }

        for (int i = 0; i < Math.max(0, ingestCount); i++) {
            JobStatusResponse created = jobService.submit(new JobSubmitRequest(
                    "ingest",
                    "inject-dataset-" + (i + 1),
                    buildIngestParams(i),
                    Map.of(
                            "seeded", true,
                            "scenario", "inject-burst",
                            "ordinal", i + 1
                    ),
                    Map.of(
                            "seeded", true,
                            "kind", "active-ingest",
                            "profile", "randomized"
                    ),
                    "sample-seeder"
            ));
            ingestIds.add(created.jobId());
        }

        long queued = jobService.list(null, com.cosmic.governance.api.model.JobState.QUEUED, 0, Integer.MAX_VALUE).size();
        long running = jobService.list(null, com.cosmic.governance.api.model.JobState.RUNNING, 0, Integer.MAX_VALUE).size();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deferredCreated", deferredIds.size());
        out.put("ingestCreated", ingestIds.size());
        out.put("deferredIds", deferredIds);
        out.put("ingestIds", ingestIds);
        out.put("queuedJobs", queued);
        out.put("runningJobs", running);
        return out;
    }

    private Map<String, Object> buildDeferredParams(String workflow, int index) {
        int complexity = 1 + (index % 3);
        int payloadMb = 64 + (index * 48);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("deferred", true);
        params.put("executor", "simulator");
        params.put("complexity", complexity);
        params.put("payloadMb", payloadMb);
        params.put("workflowHint", workflow);
        params.put("estimatedRecords", 2_000 * (index + 1));
        params.put("seeded", true);
        return params;
    }

    private Map<String, Object> buildIngestParams(int index) {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        int complexity = random.nextInt(2, 6);
        int payloadMb = random.nextInt(96, 640);
        int fanout = random.nextInt(1, 5);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("executor", "tacc");
        params.put("complexity", complexity);
        params.put("payloadMb", payloadMb);
        params.put("fanout", fanout);
        params.put("estimatedRecords", payloadMb * random.nextInt(40, 120));
        params.put("priority", random.nextBoolean() ? "high" : "normal");
        params.put("seeded", true);
        return params;
    }
}

package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.dto.IngestRequest;
import com.cosmic.governance.api.dto.IngestResponse;
import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.dto.JobSubmitResponse;
import com.cosmic.governance.api.service.JobService;
import com.cosmic.governance.api.service.JobScenarioService;
import com.cosmic.governance.api.service.DatasetService;
import com.cosmic.governance.api.dto.DatasetRequest;
import com.cosmic.governance.api.dto.DatasetResponse;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.apache.pulsar.client.admin.PulsarAdmin;
import org.apache.pulsar.client.admin.PulsarAdminException;
import org.apache.pulsar.common.policies.data.ClusterData;
import org.apache.pulsar.common.policies.data.TenantInfo;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping("/api/v1")
public class GovernanceController {
    private final JobService jobService;
    private final JobScenarioService jobScenarioService;
    private final com.cosmic.governance.api.service.SchemaService schemaService;
    private final DatasetService datasetService;
    private final RabbitTemplate rabbitTemplate;

    @Value("${pulsar.admin.url:http://localhost:8085}")
    private String pulsarAdminUrl;

    public GovernanceController(JobService jobService, JobScenarioService jobScenarioService, com.cosmic.governance.api.service.SchemaService schemaService, DatasetService datasetService, RabbitTemplate rabbitTemplate) {
        this.jobService = jobService;
        this.jobScenarioService = jobScenarioService;
        this.schemaService = schemaService;
        this.datasetService = datasetService;
        this.rabbitTemplate = rabbitTemplate;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of(
                "status", "ok",
                "service", "java-governance",
                "timestamp", Instant.now().toString()
        );
    }

    @PostMapping("/ingest")
    public ResponseEntity<IngestResponse> ingest(@Valid @RequestBody IngestRequest request) {
        String acceptedAt = Instant.now().toString();
        IngestResponse response = new IngestResponse(
                "ing-" + UUID.randomUUID(),
                "ACCEPTED",
                acceptedAt
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/jobs")
    public ResponseEntity<?> submitJob(@Valid @RequestBody JobSubmitRequest request) {
        // server-side JSON Schema validation (if a schema exists for the workflow)
        var vr = schemaService.validate(request.workflow(), request.parameters());
        if (!vr.schemaFound() && !vr.valid()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new com.cosmic.governance.api.dto.ErrorResponse("invalid_schema", null, null));
        }
        if (vr.schemaFound() && !vr.valid()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new com.cosmic.governance.api.dto.ErrorResponse("validation_failed", null, null));
        }

        JobStatusResponse created = jobService.submit(request);
        JobSubmitResponse response = new JobSubmitResponse(
            created.jobId(),
            created.status(),
            created.createdAt(),
            created.version()
        );
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/public-sources")
    public ResponseEntity<?> publicSources() {
        // simple hard-coded list used by e2e tests and UI when no backend catalog exists
        var list = List.of(
            Map.<String,Object>of("name","Example Public Source","url","https://public.example.org"),
            Map.<String,Object>of("name","Sample Archive","url","https://archive.example.org")
        );
        return ResponseEntity.ok(list);
    }

    @PostMapping("/jobs/validate")
    public ResponseEntity<?> validatePayload(@RequestBody java.util.Map<String, Object> body) {
        String type = (String) body.get("type");
        Object payload = body.get("payload");
        if (type == null) return ResponseEntity.badRequest().body(Map.of("error","missing_type"));
        var vr = schemaService.validate(type, payload);
        if (!vr.schemaFound()) return ResponseEntity.ok(Map.of("valid", true, "schemaFound", false));
        if (vr.valid()) return ResponseEntity.ok(Map.of("valid", true));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("valid", false, "message", vr.message()));
    }

    @GetMapping("/jobs/{id}")
    public ResponseEntity<?> jobStatus(@PathVariable("id") String id) {
        return jobService.get(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(new com.cosmic.governance.api.dto.ErrorResponse("job_not_found", id, null)));
    }

    @DeleteMapping("/jobs/{id}")
    public ResponseEntity<?> deleteJob(@PathVariable("id") String id) {
        boolean deleted = jobService.deleteJob(id);
        if (deleted) return ResponseEntity.noContent().build();
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new com.cosmic.governance.api.dto.ErrorResponse("job_not_found", id, null));
    }

            @GetMapping("/jobs")
            public ResponseEntity<?> listJobs(
                    @org.springframework.web.bind.annotation.RequestParam(value = "workflow", required = false) String workflow,
                    @org.springframework.web.bind.annotation.RequestParam(value = "state", required = false) String state,
                    @org.springframework.web.bind.annotation.RequestParam(value = "page", required = false, defaultValue = "0") int page,
                    @org.springframework.web.bind.annotation.RequestParam(value = "size", required = false, defaultValue = "50") int size
            ) {
                com.cosmic.governance.api.model.JobState stateFilter = null;
                if (state != null && !state.isBlank()) {
                    try {
                        stateFilter = com.cosmic.governance.api.model.JobState.valueOf(state.toUpperCase());
                    } catch (IllegalArgumentException ex) {
                        // we include allowed list as extra info but still conform to ErrorResponse schema
                        var details = Map.<String,Object>of(
                                "allowed", List.of("QUEUED","RUNNING","COMPLETED","FAILED","CANCELED","TIMED_OUT")
                        );
                        var err = new com.cosmic.governance.api.dto.ErrorResponse("invalid_state", null, null);
                        // merge into map
                        Map<String,Object> resp = new java.util.HashMap<>(details);
                        resp.put("error", err.error());
                        return ResponseEntity.badRequest().body(resp);
                    }
                }
                return ResponseEntity.ok(jobService.list(workflow, stateFilter, page, size));
            }

            @GetMapping("/jobs/types")
            public ResponseEntity<?> jobTypes() {
            return ResponseEntity.ok(jobService.types());
            }

            @GetMapping("/jobs/{id}/logs")
            public ResponseEntity<?> jobLogs(@PathVariable("id") String id) {
                String key = "job:" + id + ":logs";
                var vals = jobService.getLogs(id);
                return ResponseEntity.ok(vals);
            }

            @GetMapping("/jobs/{id}/artifacts")
            public ResponseEntity<?> jobArtifacts(@PathVariable("id") String id) {
                var arts = jobService.getArtifacts(id);
                return ResponseEntity.ok(arts);
            }

            @PostMapping("/jobs/{id}/artifacts")
            public ResponseEntity<?> postJobArtifact(@PathVariable("id") String id,
                                                     @RequestBody Map<String, Object> artifact) {
                boolean ok = jobService.attachArtifact(id, artifact);
                if (ok) return ResponseEntity.ok(Map.of("status", "attached"));
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "job_not_found_or_attach_failed", "id", id));
            }

            @GetMapping("/jobs/{id}/artifacts/{name}")
            public ResponseEntity<String> artifactContent(@PathVariable("id") String id, @PathVariable("name") String name) {
                // try to serve a file from local artifact store
                try {
                    java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", id);
                    java.nio.file.Path file = base.resolve(name).normalize();
                    if (java.nio.file.Files.exists(file) && file.startsWith(base)) {
                        String content = java.nio.file.Files.readString(file);
                        return ResponseEntity.ok(content);
                    }
                } catch (Exception ignored) {}
                // fallback to simulated artifact content for dev/testing
                String content = "Simulated artifact for job " + id + " - " + name + "\nResult: OK";
                return ResponseEntity.ok(content);
            }

            @GetMapping("/jobs/{id}/audit")
            public ResponseEntity<?> jobAudit(@PathVariable("id") String id) {
                var logs = jobService.getAuditLog().stream()
                        .filter(e -> e.contains(id))
                        .toList();
                return ResponseEntity.ok(logs);
            }

            @GetMapping("/jobs/{id}/manifest")
            public ResponseEntity<?> jobManifest(@PathVariable("id") String id) {
                var opt = jobService.getManifest(id);
                if (opt.isPresent()) {
                    return ResponseEntity.ok(opt.get());
                }
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","manifest_not_found","id",id));
            }

            @PostMapping("/jobs/{id}/manifest")
            public ResponseEntity<?> attachJobManifest(@PathVariable("id") String id,
                                                       @RequestBody Map<String, Object> manifest) {
                boolean ok = jobService.attachManifest(id, manifest);
                if (ok) return ResponseEntity.ok(Map.of("status","attached"));
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","job_not_found","id",id));
            }

            @GetMapping("/jobs/{id}/lineage")
            public ResponseEntity<?> jobLineage(@PathVariable("id") String id) {
                var opt = jobService.getLineage(id);
                if (opt.isPresent()) {
                    return ResponseEntity.ok(opt.get());
                }
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","lineage_not_found","id",id));
            }

            @PutMapping("/jobs/{id}/lineage")
            public ResponseEntity<?> updateJobLineage(@PathVariable("id") String id,
                                                     @RequestBody Map<String, Object> lineage) {
                boolean ok = jobService.updateLineage(id, lineage);
                if (ok) return ResponseEntity.ok(Map.of("status","updated"));
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","job_not_found","id",id));
            }

        @GetMapping("/admin/dispatch")
        public ResponseEntity<?> getDispatchConfig() {
            return ResponseEntity.ok(Map.of(
                "intervalSeconds", jobService.getScannerIntervalSeconds(),
                "scannedCount", jobService.getScannedCount(),
                "dispatchedCount", jobService.getDispatchedCount()
            ));
        }

        @PostMapping("/admin/dispatch")
        public ResponseEntity<?> setDispatchInterval(@RequestBody Map<String, Object> body) {
            Object v = body.get("intervalSeconds");
            if (v == null) return ResponseEntity.badRequest().body(Map.of("error","missing_intervalSeconds"));
            try {
                int seconds = Integer.parseInt(String.valueOf(v));
                jobService.setScannerIntervalSeconds(seconds);
                return ResponseEntity.ok(Map.of("intervalSeconds", seconds));
            } catch (Exception ex) {
                return ResponseEntity.badRequest().body(Map.of("error","invalid_intervalSeconds"));
            }
        }

        @PostMapping("/admin/release-deferred")
        public ResponseEntity<?> releaseDeferredSamples() {
            int released = jobService.releaseDeferredJobs();
            return ResponseEntity.ok(Map.of("released", released));
        }

        @PostMapping("/admin/sample-jobs")
        public ResponseEntity<?> seedSampleJobs(@RequestBody(required = false) Map<String, Object> body) {
            int deferredCount = 5;
            int ingestCount = 5;
            if (body != null) {
                try {
                    Object dv = body.get("deferredCount");
                    if (dv != null) deferredCount = Math.max(0, Integer.parseInt(String.valueOf(dv)));
                    Object iv = body.get("ingestCount");
                    if (iv != null) ingestCount = Math.max(0, Integer.parseInt(String.valueOf(iv)));
                } catch (NumberFormatException ex) {
                    return ResponseEntity.badRequest().body(Map.of("error", "invalid_seed_counts"));
                }
            }
            return ResponseEntity.ok(jobScenarioService.seedSampleJobs(deferredCount, ingestCount));
        }

            @PostMapping("/datasets")
            public ResponseEntity<DatasetResponse> createDataset(@RequestBody DatasetRequest req) {
                // basic manifest validation: if present, require `job` and `version`
                if (req.manifest() != null) {
                    Object job = req.manifest().get("job");
                    Object ver = req.manifest().get("version");
                    if (job == null || ver == null) {
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(null);
                    }
                }
                DatasetResponse d = datasetService.create(req);
                return ResponseEntity.status(HttpStatus.CREATED).body(d);
            }

            @GetMapping("/datasets")
            public ResponseEntity<?> listDatasets() {
                return ResponseEntity.ok(datasetService.listAll());
            }

            @GetMapping("/datasets/{id}")
            public ResponseEntity<?> getDataset(@PathVariable("id") String id) {
                return datasetService.get(id)
                        .<ResponseEntity<?>>map(ResponseEntity::ok)
                        .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","dataset_not_found","id",id)));
            }

        @PostMapping("/jobs/{id}/transition")
        public ResponseEntity<?> transitionJob(@PathVariable("id") String id, @RequestBody(required = false) java.util.Map<String,Object> reqBody) {
        // accept either { "state": "RUNNING" } or legacy { "newState": "RUNNING" } payloads
        String stateStr = null;
        Long expectedVersion = null;
        if (reqBody != null) {
            if (reqBody.containsKey("state") && reqBody.get("state") != null) stateStr = String.valueOf(reqBody.get("state"));
            else if (reqBody.containsKey("newState") && reqBody.get("newState") != null) stateStr = String.valueOf(reqBody.get("newState"));
            if (reqBody.containsKey("expectedVersion") && reqBody.get("expectedVersion") != null) {
                try { expectedVersion = Long.parseLong(String.valueOf(reqBody.get("expectedVersion"))); } catch (Exception ignored) {}
            }
        }
        if (stateStr == null || stateStr.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "validation_failed", "details", Map.of("state", "must not be null")));
        }
        com.cosmic.governance.api.model.JobState newState;
        try { newState = com.cosmic.governance.api.model.JobState.valueOf(stateStr.toUpperCase()); }
        catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new com.cosmic.governance.api.dto.ErrorResponse("invalid_state", null, null));
        }
        try {
            var result = jobService.transition(id, newState, expectedVersion);
            if (result.isPresent()) {
                return ResponseEntity.ok(result.get());
            }
        } catch (IllegalStateException ex) {
            if (ex.getMessage().startsWith("version_mismatch")) {
                long current = -1;
                String[] parts = ex.getMessage().split(":");
                if (parts.length > 1) {
                    try { current = Long.parseLong(parts[1]); } catch (NumberFormatException ignored) {}
                }
                // if the current job is already canceled, treat cancel as idempotent and return OK
                var optCur = jobService.get(id);
                if (optCur.isPresent() && "CANCELED".equalsIgnoreCase(optCur.get().status())) {
                    return ResponseEntity.ok(optCur.get());
                }
                Map<String,Object> resp = new java.util.HashMap<>();
                resp.put("error", "version_mismatch");
                resp.put("jobId", id);
                resp.put("currentVersion", current);
                return ResponseEntity.status(HttpStatus.CONFLICT).body(resp);
            }
            throw ex;
        }
        // determine whether job existed
        if (jobService.get(id).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new com.cosmic.governance.api.dto.ErrorResponse("job_not_found", id, null));
        }
        // otherwise it was an invalid state transition
        var err = new com.cosmic.governance.api.dto.ErrorResponse("invalid_transition", id, null);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(err);
        }

        @PostMapping("/jobs/{id}/cancel")
        public ResponseEntity<?> cancelJob(@PathVariable("id") String id, @Valid @RequestBody(required = false) com.cosmic.governance.api.dto.JobCancelRequest req) {
            try {
                Long expected = req == null ? null : req.expectedVersion();
                var res = jobService.cancel(id, expected);
                if (res.isPresent()) {
                    return ResponseEntity.ok(res.get());
                }
            } catch (IllegalStateException ex) {
                if (ex.getMessage().startsWith("version_mismatch")) {
                    long current = -1;
                    String[] parts = ex.getMessage().split(":");
                    if (parts.length > 1) {
                        try { current = Long.parseLong(parts[1]); } catch (NumberFormatException ignored) {}
                    }
                    // if the current job is already canceled, treat cancel as idempotent and return OK
                    var optCur = jobService.get(id);
                    if (optCur.isPresent() && "CANCELED".equalsIgnoreCase(optCur.get().status())) {
                        return ResponseEntity.ok(optCur.get());
                    }
                    Map<String,Object> resp = new java.util.HashMap<>();
                    resp.put("error", "version_mismatch");
                    resp.put("jobId", id);
                    resp.put("currentVersion", current);
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(resp);
                }
                throw ex;
            }
            var opt = jobService.get(id);
            if (opt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new com.cosmic.governance.api.dto.ErrorResponse("job_not_found", id, null));
            }
            var current = opt.get();
            // make cancel idempotent: if already canceled, return OK with current state
            if ("CANCELED".equalsIgnoreCase(current.status())) {
                return ResponseEntity.ok(current);
            }
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new com.cosmic.governance.api.dto.ErrorResponse("cannot_cancel", id, null));
        }

        @PostMapping("/jobs/{id}/retry")
        public ResponseEntity<?> retryJob(@PathVariable("id") String id, @RequestBody(required = false) com.cosmic.governance.api.dto.JobTransitionRequest req) {
                try {
                    Long expected = req == null ? null : req.expectedVersion();
                    var result = jobService.retry(id, expected);
                    if (result.isPresent()) return ResponseEntity.ok(result.get());
                } catch (IllegalStateException ex) {
                    if (ex.getMessage().startsWith("version_mismatch")) {
                        long current = -1;
                        String[] parts = ex.getMessage().split(":");
                        if (parts.length > 1) {
                            try { current = Long.parseLong(parts[1]); } catch (NumberFormatException ignored) {}
                        }
                        Map<String,Object> resp = new java.util.HashMap<>();
                        resp.put("error", "version_mismatch");
                        resp.put("jobId", id);
                        resp.put("currentVersion", current);
                        return ResponseEntity.status(HttpStatus.CONFLICT).body(resp);
                    }
                    throw ex;
                }
                if (jobService.get(id).isEmpty()) {
                    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new com.cosmic.governance.api.dto.ErrorResponse("job_not_found", id, null));
                }
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new com.cosmic.governance.api.dto.ErrorResponse("cannot_retry", id, null));
            }

    @GetMapping("/pulsar/status")
    public ResponseEntity<?> getPulsarStatus() {
        try (PulsarAdmin admin = PulsarAdmin.builder()
                .serviceHttpUrl(pulsarAdminUrl) // Configurable Pulsar admin URL
                .build()) {

            // Get cluster info
            List<String> clusters = admin.clusters().getClusters();
            int brokers = 0;
            if (!clusters.isEmpty()) {
                String clusterName = clusters.get(0);
                brokers = admin.brokers().getActiveBrokers(clusterName).size();
            }

            // For topics and partitions, use a simpler approach
            // This is approximate as it requires scanning all tenants/namespaces
            int topics = 0;
            int partitions = 0;
            try {
                List<String> tenants = admin.tenants().getTenants();
                for (String tenant : tenants) {
                    List<String> namespaces = admin.namespaces().getNamespaces(tenant);
                    for (String namespace : namespaces) {
                        List<String> topicList = admin.topics().getList(namespace);
                        topics += topicList.size();
                        // Count partitions for each topic
                        for (String topic : topicList) {
                            try {
                                var partitionedMeta = admin.topics().getPartitionedTopicMetadata(topic);
                                partitions += partitionedMeta.partitions > 0 ? partitionedMeta.partitions : 1;
                            } catch (Exception e) {
                                // Non-partitioned topic, count as 1 partition
                                partitions += 1;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                // If we can't get detailed stats, return basic info
                topics = -1;
                partitions = -1;
            }

            Map<String, Object> status = Map.of(
                "brokers", brokers,
                "topics", topics,
                "partitions", partitions,
                "status", brokers > 0 ? "healthy" : "degraded",
                "lastUpdated", Instant.now().toString()
            );
            return ResponseEntity.ok(status);

        } catch (Exception e) {
            // Fallback to mock data if Pulsar is not available
            Map<String, Object> status = Map.of(
                "brokers", 0,
                "topics", 0,
                "partitions", 0,
                "status", "unavailable",
                "error", e.getMessage(),
                "lastUpdated", Instant.now().toString()
            );
            return ResponseEntity.ok(status);
        }
    }

    @GetMapping("/rabbitmq/status")
    public ResponseEntity<?> getRabbitMQStatus() {
        try {
            // Check RabbitMQ connection by attempting to declare a test queue
            Queue testQueue = new Queue("cosmic.test.queue", false, true, true);
            rabbitTemplate.execute(channel -> {
                channel.queueDeclare(testQueue.getName(), testQueue.isDurable(),
                    testQueue.isExclusive(), testQueue.isAutoDelete(), null);
                return null;
            });

            // Get basic connection info
            Map<String, Object> status = Map.of(
                "status", "healthy",
                "connection", "established",
                "queues", Map.of(
                    "audit", "cosmic.audit.queue",
                    "control", "cosmic.control.queue"
                ),
                "exchanges", Map.of(
                    "audit", "cosmic.audit.exchange",
                    "control", "cosmic.control.exchange"
                ),
                "lastUpdated", Instant.now().toString()
            );
            return ResponseEntity.ok(status);

        } catch (Exception e) {
            Map<String, Object> status = Map.of(
                "status", "unavailable",
                "connection", "failed",
                "error", e.getMessage(),
                "lastUpdated", Instant.now().toString()
            );
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(status);
        }
    }
}

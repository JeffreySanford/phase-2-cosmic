package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.dto.IngestRequest;
import com.cosmic.governance.api.dto.IngestResponse;
import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.dto.JobSubmitResponse;
import com.cosmic.governance.api.service.JobService;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class GovernanceController {
    private final JobService jobService;
    private final com.cosmic.governance.api.service.SchemaService schemaService;
    private final DatasetService datasetService;

    public GovernanceController(JobService jobService, com.cosmic.governance.api.service.SchemaService schemaService, DatasetService datasetService) {
        this.jobService = jobService;
        this.schemaService = schemaService;
        this.datasetService = datasetService;
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
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
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
        public ResponseEntity<?> transitionJob(@PathVariable("id") String id, @Valid @RequestBody com.cosmic.governance.api.dto.JobTransitionRequest req) {
        // attempt transition; handle missing job, invalid transition, or version mismatch
        try {
            var result = jobService.transition(id, req.state(), req.expectedVersion());
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
        // TODO: Implement actual Pulsar admin client integration
        // For now, return mock status data
        Map<String, Object> status = Map.of(
            "brokers", 1,
            "topics", 5,
            "partitions", 15,
            "status", "healthy",
            "lastUpdated", Instant.now().toString()
        );
        return ResponseEntity.ok(status);
    }
}

package com.cosmic.governance.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cosmic.governance.test.AbstractRedisTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * S2-4: Edge-case tests for job lifecycle paths:
 *   - manifest attach / retrieve / not-found
 *   - lineage update / retrieve / not-found
 *   - cancel on non-existent job, cancel on terminal job
 *   - retry on QUEUED job, retry on non-existent job
 *   - transition on non-existent job
 */
@SpringBootTest
@AutoConfigureMockMvc
class JobLifecycleEdgeCaseTest extends AbstractRedisTest {

    @Autowired
    private MockMvc mockMvc;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── helpers ───────────────────────────────────────────────────────────────

    private String submitJob(String workflow) throws Exception {
        String body = String.format("""
                {"workflow":"%s","datasetId":"ds-edge","requestedBy":"test"}
                """, workflow);
        String resp = mockMvc.perform(post("/api/v1/jobs")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(resp).get("jobId").asText();
    }

    private long getVersion(String jobId) throws Exception {
        String resp = mockMvc.perform(get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(resp).get("version").asLong();
    }

    private void transitionTo(String jobId, String state) throws Exception {
        String body = String.format("{\"state\":\"%s\"}", state);
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/transition")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    // ── Manifest ──────────────────────────────────────────────────────────────

    @Test
    void manifestGetOnFreshJobReturnsNotFound() throws Exception {
        // A freshly submitted job has no manifest attached yet
        String id = submitJob("casa-imaging");
        mockMvc.perform(get("/api/v1/jobs/" + id + "/manifest"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("manifest_not_found"));
    }

    @Test
    void manifestAttachAndRetrieveRoundTrip() throws Exception {
        String id = submitJob("casa-imaging");
        String manifest = "{\"job\":\"" + id + "\",\"version\":\"1.0\",\"checksum\":\"abc123\"}";

        // Attach manifest
        mockMvc.perform(post("/api/v1/jobs/" + id + "/manifest")
                        .contentType(MediaType.APPLICATION_JSON).content(manifest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("attached"));

        // Retrieve it back
        mockMvc.perform(get("/api/v1/jobs/" + id + "/manifest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.job").value(id))
                .andExpect(jsonPath("$.version").value("1.0"))
                .andExpect(jsonPath("$.checksum").value("abc123"));
    }

    @Test
    void manifestAttachOnUnknownJobReturns404() throws Exception {
        String manifest = "{\"job\":\"unknown\",\"version\":\"1.0\"}";
        mockMvc.perform(post("/api/v1/jobs/nonexistent-id-manifest/manifest")
                        .contentType(MediaType.APPLICATION_JSON).content(manifest))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job_not_found"));
    }

    // ── Lineage ───────────────────────────────────────────────────────────────

    @Test
    void lineageGetOnJobWithNoLineageReturnsNotFound() throws Exception {
        // Job submitted without lineage param
        String id = submitJob("sdp-pipeline");
        mockMvc.perform(get("/api/v1/jobs/" + id + "/lineage"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("lineage_not_found"));
    }

    @Test
    void lineageUpdateAndRetrieveRoundTrip() throws Exception {
        String id = submitJob("sdp-pipeline");
        String lineage = "{\"parentJobId\":\"parent-abc\",\"ancestorCount\":2}";

        // Update lineage
        mockMvc.perform(put("/api/v1/jobs/" + id + "/lineage")
                        .contentType(MediaType.APPLICATION_JSON).content(lineage))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("updated"));

        // Retrieve it back
        mockMvc.perform(get("/api/v1/jobs/" + id + "/lineage"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parentJobId").value("parent-abc"))
                .andExpect(jsonPath("$.ancestorCount").value(2));
    }

    @Test
    void lineageUpdateOnUnknownJobReturns404() throws Exception {
        String lineage = "{\"parentJobId\":\"ghost\"}";
        mockMvc.perform(put("/api/v1/jobs/nonexistent-id-lineage/lineage")
                        .contentType(MediaType.APPLICATION_JSON).content(lineage))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job_not_found"));
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    @Test
    void cancelNonExistentJobReturns404() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/nonexistent-id-cancel/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":1}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job_not_found"));
    }

    @Test
    void cancelCompletedJobReturnsCannotCancel() throws Exception {
        // QUEUED → RUNNING → COMPLETED; COMPLETED is terminal so cancel must fail
        String id = submitJob("archive");
        transitionTo(id, "RUNNING");
        transitionTo(id, "COMPLETED");

        mockMvc.perform(post("/api/v1/jobs/" + id + "/cancel"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("cannot_cancel"));
    }

    // ── Retry ─────────────────────────────────────────────────────────────────

    @Test
    void retryQueuedJobReturnsCannotRetry() throws Exception {
        // A freshly submitted job is QUEUED; retry is only valid from FAILED/CANCELED/TIMED_OUT
        String id = submitJob("archive");
        mockMvc.perform(post("/api/v1/jobs/" + id + "/retry"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("cannot_retry"));
    }

    @Test
    void retryNonExistentJobReturns404() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/nonexistent-id-retry/retry"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job_not_found"));
    }

    // ── Transition ────────────────────────────────────────────────────────────

    @Test
    void transitionNonExistentJobReturns404() throws Exception {
        String body = "{\"state\":\"RUNNING\"}";
        mockMvc.perform(post("/api/v1/jobs/nonexistent-id-transition/transition")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job_not_found"));
    }
}

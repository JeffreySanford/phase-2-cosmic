package com.cosmic.governance.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import com.cosmic.governance.test.AbstractRedisTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class GovernanceControllerTest extends AbstractRedisTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthEndpointReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void submitJobMissingWorkflowReturnsBadRequest() throws Exception {
        String invalid = "{\"datasetId\":\"foo\"}";
        mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest());
    }

    @Test
    void submitJobInvalidJsonReturnsBadRequest() throws Exception {
        String invalid = "{not a json}";
        mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest());
    }

    @Test
    void submitJobAndReadStatus() throws Exception {
        String body = """
                {
                  "workflow": "casa-imaging",
                  "datasetId": "VLASS_J1347+1217",
                  "parameters": {"weighting": "briggs"},
                  "requestedBy": "integration-test"
                }
                """;

        String response = mockMvc.perform(
                        post("/api/v1/jobs")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        String jobId = response.replaceAll(".*\"jobId\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.status").value("QUEUED"));
    }

    @Test
    void transitionWithVersionMismatchReturnsConflict() throws Exception {
        String body = """
                {"workflow":"x","datasetId":"y","parameters":{},"requestedBy":"u"}
                """;
        String resp = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String jobId = resp.replaceAll(".*\"jobId\"\s*:\s*\"([^\"]+)\".*", "$1");
        // fetch status to get version
        String statusResp = mockMvc.perform(get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long ver = Long.parseLong(statusResp.replaceAll(".*\"version\"\s*:\s*(\d+).*", "$1"));
        // post transition with wrong version
        String trans = String.format("{\"state\":\"RUNNING\",\"expectedVersion\":%d}", ver+1);
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/transition")
                        .contentType(MediaType.APPLICATION_JSON).content(trans))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("version_mismatch"));
    }

    @Test
    void cancelEndpointWorksAndIsIdempotent() throws Exception {
        String body = """
                {"workflow":"a","datasetId":"b","parameters":{},"requestedBy":"u"}
                """;
        String resp = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String jobId = resp.replaceAll(".*\"jobId\"\s*:\s*\"([^\"]+)\".*", "$1");
        // cancel with version from status
        String statusResp = mockMvc.perform(get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long ver = Long.parseLong(statusResp.replaceAll(".*\"version\"\s*:\s*(\d+).*", "$1"));
        String cancelReq = String.format("{\"expectedVersion\":%d}", ver);
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON).content(cancelReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELED"))
                .andExpect(jsonPath("$.version").value(ver+1));
        // second cancel is still ok
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON).content(cancelReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELED"));
    }

    @Test
    void retryEndpointTransitionsFailedJobs() throws Exception {
        String body = """
                {"workflow":"a","datasetId":"b","parameters":{},"requestedBy":"u"}
                """;
        String resp = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String jobId = resp.replaceAll(".*\"jobId\"\s*:\s*\"([^\"]+)\".*", "$1");
        // manually transition to FAILED
        String trans = "{\"state\":\"FAILED\"}";
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/transition")
                        .contentType(MediaType.APPLICATION_JSON).content(trans))
                .andExpect(status().isOk());
        // now retry
        String retryReq = "{}";
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/retry")
                        .contentType(MediaType.APPLICATION_JSON).content(retryReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"));
    }

    @Test
    void requestIdIsPropagatedToResponses() throws Exception {
        mockMvc.perform(get("/api/v1/health").header("X-Request-Id","test-id"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Request-Id","test-id"));
    }

    @Test
    void listJobsFilteringAndPagination() throws Exception {
        String wf = "test-fw-" + UUID.randomUUID();
        String bodyA = String.format("""
                {
                  "workflow": "%s",
                  "datasetId": "DS1",
                  "parameters": {},
                  "requestedBy": "t"
                }
                """, wf);
        String bodyB = String.format("""
                {
                  "workflow": "%s",
                  "datasetId": "DS2",
                  "parameters": {},
                  "requestedBy": "t"
                }
                """, wf);
        String bodyC = """
                {
                  "workflow": "other-workflow",
                  "datasetId": "DS3",
                  "parameters": {},
                  "requestedBy": "t"
                }
                """;

        mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(bodyA)).andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(bodyB)).andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(bodyC)).andExpect(status().isAccepted());

        // filter by unique workflow
        mockMvc.perform(get("/api/v1/jobs").param("workflow", wf))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        // pagination (size=1)
        mockMvc.perform(get("/api/v1/jobs").param("workflow", wf).param("page","0").param("size","1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void versioningAndLockingWorks() throws Exception {
        String body = """
                {
                  "workflow": "foo",
                  "datasetId": "ds",
                  "parameters": {},
                  "requestedBy": "u"
                }
                """;
        String resp = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andReturn().getResponse().getContentAsString();
        String id = resp.replaceAll(".*\"jobId\"\s*:\s*\"([^\"]+)\".*", "$1");
        long version = Long.parseLong(resp.replaceAll(".*\"version\"\s*:\s*([0-9]+).*", "$1"));

        // valid transition with correct version
        String trans = String.format("{\"state\":\"RUNNING\",\"expectedVersion\":%d}", version);
        mockMvc.perform(post("/api/v1/jobs/"+id+"/transition").contentType(MediaType.APPLICATION_JSON).content(trans))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(version+1));

        // attempt again with old version should conflict
        mockMvc.perform(post("/api/v1/jobs/"+id+"/transition").contentType(MediaType.APPLICATION_JSON).content(trans))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("version_mismatch"));
    }

    @Test
    void cancelAndRetryEndpoints() throws Exception {
        String body = """
                {
                  "workflow": "bar",
                  "datasetId": "ds2",
                  "parameters": {},
                  "requestedBy": "u"
                }
                """;
        String resp = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String id = resp.replaceAll(".*\"jobId\"\s*:\s*\"([^\"]+)\".*", "$1");

        // cancel immediately
        mockMvc.perform(post("/api/v1/jobs/"+id+"/cancel")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELED"));

        // retry should now requeue
        mockMvc.perform(post("/api/v1/jobs/"+id+"/retry")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"));
    }

    @Test
    void requestIdHeaderIsPropagated() throws Exception {
        mockMvc.perform(get("/api/v1/health").header("X-Request-Id","test-123"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Request-Id","test-123"));
    }

    @Test
    void listJobsInvalidStateReturnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/v1/jobs").param("state","INVALID"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_state"))
                .andExpect(jsonPath("$.allowed").isArray());
    }

    @Test
    void transitionInvalidStateReturnsBadRequest() throws Exception {
        String body = """
                {"workflow":"x","datasetId":"y","parameters":{},"requestedBy":"u"}
                """;
        String r = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String jobId = r.replaceAll(".*\"jobId\"\s*:\s*\"([^\"]+)\".*", "$1");

        String badTransition = "{\"state\":\"COMPLETED\"}";
        // it's queued initially so COMPLETED is invalid
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/transition")
                        .contentType(MediaType.APPLICATION_JSON).content(badTransition))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_transition"));
    }
}

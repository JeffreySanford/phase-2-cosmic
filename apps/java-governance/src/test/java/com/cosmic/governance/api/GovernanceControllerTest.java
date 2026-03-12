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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
class GovernanceControllerTest extends AbstractRedisTest {
    @Autowired
    private MockMvc mockMvc;

        private static final ObjectMapper MAPPER = new ObjectMapper();

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
                  "lineage": {"parentJobId":"orig-1"},
                  "parameters": {"weighting": "briggs", "deferred": true},
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

        JsonNode jobNode = MAPPER.readTree(response);
        String jobId = jobNode.get("jobId").asText();

        mockMvc.perform(get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.status").value("QUEUED"));

        // lineage endpoint returns the parentJobId value
        mockMvc.perform(get("/api/v1/jobs/" + jobId + "/lineage"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parentJobId").value("orig-1"));
    }

    @Test
    void transitionWithVersionMismatchReturnsConflict() throws Exception {
        String body = """
                {"workflow":"x","datasetId":"y","parameters":{},"requestedBy":"u"}
                """;
        String resp = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        JsonNode n1 = MAPPER.readTree(resp);
        String jobId = n1.get("jobId").asText();
        // fetch status to get version
        String statusResp = mockMvc.perform(get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode statusNode = MAPPER.readTree(statusResp);
        long ver = statusNode.get("version").asLong();
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
        JsonNode n2 = MAPPER.readTree(resp);
        String jobId = n2.get("jobId").asText();
        // cancel with version from status
        String statusResp = mockMvc.perform(get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode statusNode2 = MAPPER.readTree(statusResp);
        long ver = statusNode2.get("version").asLong();
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
        JsonNode n3 = MAPPER.readTree(resp);
        String jobId = n3.get("jobId").asText();
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
                  "parameters": {"deferred": true},
                  "requestedBy": "u"
                }
                """;
        String resp = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andReturn().getResponse().getContentAsString();
        JsonNode n4 = MAPPER.readTree(resp);
        String id = n4.get("jobId").asText();
        JsonNode n5 = MAPPER.readTree(resp);
        long version = n5.get("version").asLong();

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
        JsonNode n6 = MAPPER.readTree(resp);
        String id = n6.get("jobId").asText();

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
                {"workflow":"x","datasetId":"y","parameters":{"deferred":true},"requestedBy":"u"}
                """;
        String r = mockMvc.perform(post("/api/v1/jobs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        JsonNode n7 = MAPPER.readTree(r);
        String jobId = n7.get("jobId").asText();

        String badTransition = "{\"state\":\"COMPLETED\"}";
        // it's queued initially so COMPLETED is invalid
        mockMvc.perform(post("/api/v1/jobs/" + jobId + "/transition")
                        .contentType(MediaType.APPLICATION_JSON).content(badTransition))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_transition"));
    }

    @Test
    void pulsarStatusEndpointReturnsMockData() throws Exception {
        mockMvc.perform(get("/api/v1/pulsar/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.brokers").isNumber())
                .andExpect(jsonPath("$.topics").isNumber())
                .andExpect(jsonPath("$.partitions").isNumber())
                .andExpect(jsonPath("$.status").isString())
                .andExpect(jsonPath("$.lastUpdated").isString());
    }

    // ── VO workflow submission tests ─────────────────────────────────────────

    @Test
    void submitVoConeSearchJobReturnsAccepted() throws Exception {
        String body = """
                {
                  "workflow": "vo.cone-search",
                  "datasetId": "vo-ds-01",
                  "requestedBy": "tester",
                  "parameters": {
                    "provider": "CHANDRA",
                    "serviceUrl": "https://cxc.cfa.harvard.edu/cgi-bin/browse/cone.pl"
                  }
                }
                """;
        mockMvc.perform(post("/api/v1/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId").isString())
                .andExpect(jsonPath("$.status").value("QUEUED"));
    }

    @Test
    void submitVoConeSearchMissingProviderReturnsBadRequest() throws Exception {
        String body = """
                {
                  "workflow": "vo.cone-search",
                  "datasetId": "vo-ds-02",
                  "requestedBy": "tester",
                  "parameters": {
                    "serviceUrl": "https://cxc.cfa.harvard.edu/cgi-bin/browse/cone.pl"
                  }
                }
                """;
        mockMvc.perform(post("/api/v1/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void submitVoAdqlQueryJobReturnsAccepted() throws Exception {
        String body = """
                {
                  "workflow": "vo.adql.query",
                  "datasetId": "vo-ds-03",
                  "requestedBy": "tester",
                  "parameters": {
                    "provider": "ESAC",
                    "tapUrl": "https://gea.esac.esa.int/tap-server/tap/sync",
                    "adql": "SELECT TOP 10 * FROM gaiadr3.gaia_source"
                  }
                }
                """;
        mockMvc.perform(post("/api/v1/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId").isString());
    }

    @Test
    void submitVoAdqlQueryMissingAdqlReturnsBadRequest() throws Exception {
        String body = """
                {
                  "workflow": "vo.adql.query",
                  "datasetId": "vo-ds-04",
                  "requestedBy": "tester",
                  "parameters": {
                    "provider": "ESAC",
                    "tapUrl": "https://gea.esac.esa.int/tap-server/tap/sync"
                  }
                }
                """;
        mockMvc.perform(post("/api/v1/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void jobTypesIncludesVoWorkflows() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/types"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@=='vo.cone-search')]").exists())
                .andExpect(jsonPath("$[?(@=='vo.adql.query')]").exists())
                .andExpect(jsonPath("$[?(@=='vo.obscore.search')]").exists())
                .andExpect(jsonPath("$[?(@=='vo.votable.fetch')]").exists());
    }
}

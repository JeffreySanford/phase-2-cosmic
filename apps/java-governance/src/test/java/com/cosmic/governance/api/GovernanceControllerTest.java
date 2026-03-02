package com.cosmic.governance.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
}

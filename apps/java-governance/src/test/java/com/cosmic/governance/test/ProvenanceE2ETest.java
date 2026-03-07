package com.cosmic.governance.test;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import java.util.Map;

/**
 * End-to-end test exercise for the provenance/audit flow of job processing.
 *
 * This skeleton submits a job and then inspects log/audit output or Redis to
 * assert that a provenance record was emitted.  The details will expand as
 * the provenance store implementation matures.
 */
@SpringBootTest(properties = {"governance.auth.enabled=false"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class ProvenanceE2ETest extends TestcontainersConfig {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private com.cosmic.governance.api.service.JobService jobService;

    @Test
    void jobSubmissionGeneratesAuditRecord() throws Exception {
        String payload = "{\"workflow\":\"demo\",\"datasetId\":\"ds1\",\"manifest\":{\"job\":\"demo1\",\"version\":1},\"lineage\":{\"parentJobId\":\"p-0001\"},\"parameters\":{},\"requestedBy\":\"tester\"}";

        // submit job and capture returned jobId
        var result = mockMvc.perform(post("/api/v1/jobs").contentType("application/json").content(payload))
               .andExpect(status().isAccepted())
               .andReturn();
        String body = result.getResponse().getContentAsString();
        var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
        String jobId = json.get("jobId").asText();

        // wait for an audit entry containing the jobId and manifest indication
        boolean found = false;
        for (int i = 0; i < 10 && !found; i++) {
            for (String entry : jobService.getAuditLog()) {
                if (entry.contains("workflow=demo") && entry.contains(jobId) && entry.contains("manifest")) {
                    found = true;
                    break;
                }
            }
            if (!found) Thread.sleep(500);
        }
        org.junit.jupiter.api.Assertions.assertTrue(found, "expected provenance audit entry including manifest for " + jobId);

        // verify job status returns the manifest field and its contents
        var statusOpt = jobService.get(jobId);
        org.junit.jupiter.api.Assertions.assertTrue(statusOpt.isPresent(), "status should be present");
        var status = statusOpt.get();
        org.junit.jupiter.api.Assertions.assertNotNull(status.manifest(), "manifest field should not be null");
        java.util.Map<String,Object> manifestMap = status.manifest();
        org.junit.jupiter.api.Assertions.assertEquals("demo1", manifestMap.get("job"));
        org.junit.jupiter.api.Assertions.assertEquals(1, manifestMap.get("version"));

        // additionally call the HTTP GET status endpoint and ensure the manifest is returned there too
        var statusMvc = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/jobs/" + jobId))
                .andExpect(status().isOk())
                .andReturn();
        String statusBody = statusMvc.getResponse().getContentAsString();
        var statusJson = new com.fasterxml.jackson.databind.ObjectMapper().readTree(statusBody);
        var manifestNode = statusJson.get("manifest");
        org.junit.jupiter.api.Assertions.assertNotNull(manifestNode, "status endpoint should include manifest");
        org.junit.jupiter.api.Assertions.assertEquals("demo1", manifestNode.get("job").asText());
        org.junit.jupiter.api.Assertions.assertEquals(1, manifestNode.get("version").asInt());

        // also verify the new audit HTTP endpoint reflects the same log
        var auditMvc = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/jobs/" + jobId + "/audit"))
                .andExpect(status().isOk())
                .andReturn();
        String auditBody = auditMvc.getResponse().getContentAsString();
        java.util.List<?> entries = new com.fasterxml.jackson.databind.ObjectMapper().readValue(auditBody, java.util.List.class);
        boolean foundEntry = entries.stream().anyMatch(o -> o.toString().contains("manifest"));
        org.junit.jupiter.api.Assertions.assertTrue(foundEntry, "audit endpoint should include manifest entry");

        // verify job manifest retrieval endpoint returns same manifest
        var manifestMvc = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/jobs/" + jobId + "/manifest"))
                .andExpect(status().isOk())
                .andReturn();
        String manifestBody = manifestMvc.getResponse().getContentAsString();
        var manifestJson = new com.fasterxml.jackson.databind.ObjectMapper().readTree(manifestBody);
        org.junit.jupiter.api.Assertions.assertEquals("demo1", manifestJson.get("job").asText());
        org.junit.jupiter.api.Assertions.assertEquals(1, manifestJson.get("version").asInt());

        // lineage endpoint should expose the parentJobId we submitted
        var lineageMvc = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/jobs/" + jobId + "/lineage"))
                .andExpect(status().isOk())
                .andReturn();
        String lineageBody = lineageMvc.getResponse().getContentAsString();
        var lineageJson = new com.fasterxml.jackson.databind.ObjectMapper().readTree(lineageBody);
        org.junit.jupiter.api.Assertions.assertEquals("p-0001", lineageJson.get("parentJobId").asText());

        // attach a new manifest via API and verify
        java.util.Map<String,Object> newManifest = Map.of("job","updated","version",2);
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/jobs/" + jobId + "/manifest")
                .contentType("application/json")
                .content(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(newManifest)))
                .andExpect(status().isOk());
        // retrieve again
        manifestMvc = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/jobs/" + jobId + "/manifest"))
                .andExpect(status().isOk())
                .andReturn();
        manifestBody = manifestMvc.getResponse().getContentAsString();
        manifestJson = new com.fasterxml.jackson.databind.ObjectMapper().readTree(manifestBody);
        org.junit.jupiter.api.Assertions.assertEquals("updated", manifestJson.get("job").asText());
        org.junit.jupiter.api.Assertions.assertEquals(2, manifestJson.get("version").asInt());
    }

    @Test
    void datasetCreationAcceptsManifest() throws Exception {
        // create dataset via API with manifest
        var manifest = Map.of("job", "dsjob", "version", 5);
        var createReq = Map.of(
                "name", "ds-with-manifest",
                "description", "testing",
                "manifest", manifest
        );
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var createResult = mockMvc.perform(post("/api/v1/datasets")
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String body = createResult.getResponse().getContentAsString();
        var json = mapper.readTree(body);
        String dsId = json.get("id").asText();
        // retrieving dataset should show manifest field
        var getMvc = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/datasets/" + dsId))
                .andExpect(status().isOk())
                .andReturn();
        String getBody = getMvc.getResponse().getContentAsString();
        var dsJson = mapper.readTree(getBody);
        org.junit.jupiter.api.Assertions.assertEquals("dsjob", dsJson.get("manifest").get("job").asText());
        org.junit.jupiter.api.Assertions.assertEquals(5, dsJson.get("manifest").get("version").asInt());

        // negative: missing fields should return 400
        var badReq = Map.of("name", "bad", "manifest", Map.of("job", "x"));
        mockMvc.perform(post("/api/v1/datasets").contentType("application/json")
                        .content(mapper.writeValueAsString(badReq)))
                .andExpect(status().isBadRequest());
    }
}

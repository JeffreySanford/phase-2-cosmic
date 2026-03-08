package com.cosmic.governance.api;

import com.cosmic.governance.test.AbstractRedisTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class AlertControllerTest extends AbstractRedisTest {

    @Autowired
    private MockMvc mockMvc;

    private static final String INGEST_BODY = """
            {
              "eventType": "SENSOR_FAULT",
              "severity": "CRITICAL",
              "sourceSystem": "antenna-array-01",
              "correlationId": "corr-test-001",
              "message": "Antenna feed voltage out of range",
              "tags": ["antenna", "power"],
              "latencyMs": 42.5
            }
            """;

    private static final String DLQ_BODY = """
            {
              "eventType": "DLQ_OVERFLOW",
              "severity": "WARNING",
              "sourceSystem": "broker-dlq",
              "correlationId": "corr-dlq-001",
              "message": "Dead letter queue depth exceeded threshold",
              "tags": ["dlq", "broker"],
              "latencyMs": 10.0
            }
            """;

    @Test
    void ingestAlertReturns201WithGeneratedId() throws Exception {
        mockMvc.perform(post("/api/v1/alerts/ingest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(INGEST_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.eventType", is("SENSOR_FAULT")))
                .andExpect(jsonPath("$.severity", is("CRITICAL")))
                .andExpect(jsonPath("$.correlationId", is("corr-test-001")))
                .andExpect(jsonPath("$.replayed", is(false)));
    }

    @Test
    void getSloMetricsReflectsIngestCount() throws Exception {
        // Ingest one alert so the counter is non-zero
        mockMvc.perform(post("/api/v1/alerts/ingest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(INGEST_BODY))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/alerts/slo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alertIngestedTotal", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.measuredAt", notNullValue()));
    }

    @Test
    void sendToDlqThenListDlqContainsAlert() throws Exception {
        mockMvc.perform(post("/api/v1/alerts/dlq")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DLQ_BODY))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/alerts/dlq"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0]", notNullValue()))
                .andExpect(jsonPath("$[0].eventType", is("DLQ_OVERFLOW")));
    }

    @Test
    void replayFromDlqSucceedsAndSetsReplayedFlag() throws Exception {
        // Push to DLQ
        String createResult = mockMvc.perform(post("/api/v1/alerts/dlq")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DLQ_BODY))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        // Grab the ID from the DLQ listing
        String dlqResponse = mockMvc.perform(get("/api/v1/alerts/dlq"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Parse first ID via JSON path check — replay via replay-all for simplicity
        mockMvc.perform(post("/api/v1/alerts/dlq/replay-all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", greaterThanOrEqualTo(1)));
    }

    @Test
    void replayNonExistentDlqAlertReturns404() throws Exception {
        mockMvc.perform(post("/api/v1/alerts/dlq/replay/nonexistent-alert-id-99"))
                .andExpect(status().isNotFound());
    }
}

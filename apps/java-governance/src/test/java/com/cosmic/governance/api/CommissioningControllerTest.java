package com.cosmic.governance.api;

import com.cosmic.governance.test.AbstractRedisTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class CommissioningControllerTest extends AbstractRedisTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void getScenariosReturnsThreeBuiltIns() throws Exception {
        mockMvc.perform(get("/api/v1/commissioning/scenarios"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].id", is("antenna_calibration")))
                .andExpect(jsonPath("$[1].id", is("timing_sync")))
                .andExpect(jsonPath("$[2].id", is("rfi_baseline")));
    }

    @Test
    void validateWithAllRequiredParametersReturnsPass() throws Exception {
        String body = """
                {
                  "scenarioId": "antenna_calibration",
                  "parameters": {
                    "antennaId": "ANT-001",
                    "targetFrequencyMHz": 1400,
                    "pointingModelVersion": "v2.3"
                  }
                }
                """;
        mockMvc.perform(post("/api/v1/commissioning/validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pass", is(true)))
                .andExpect(jsonPath("$.failures", hasSize(0)))
                .andExpect(jsonPath("$.scenarioName", is("Antenna Calibration")));
    }

    @Test
    void validateWithMissingParametersReturnsFail() throws Exception {
        String body = """
                {
                  "scenarioId": "timing_sync",
                  "parameters": {
                    "referenceElementId": "REF-001"
                  }
                }
                """;
        mockMvc.perform(post("/api/v1/commissioning/validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pass", is(false)))
                .andExpect(jsonPath("$.failures", hasSize(2)));
    }

    @Test
    void validateWithUnknownScenarioIdReturns404() throws Exception {
        String body = """
                {
                  "scenarioId": "nonexistent_scenario",
                  "parameters": {}
                }
                """;
        mockMvc.perform(post("/api/v1/commissioning/validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.pass", is(false)));
    }
}

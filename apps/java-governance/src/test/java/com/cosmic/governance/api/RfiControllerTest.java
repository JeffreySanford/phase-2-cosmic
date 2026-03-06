package com.cosmic.governance.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.cosmic.governance.test.AbstractRedisTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
public class RfiControllerTest extends AbstractRedisTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void postRfiEventAccepted() throws Exception {
        String payload = "{\"band\":\"L\",\"intensity\":\"low\",\"startTime\":\"2026-03-06T00:00:00Z\",\"endTime\":\"2026-03-06T00:01:00Z\"}";
        mockMvc.perform(post("/api/v1/rfi").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("accepted"));
    }

    @Test
    void postRfiEventMissingFieldsReturnsBadRequest() throws Exception {
        String payload = "{\"band\":\"L\"}";
        mockMvc.perform(post("/api/v1/rfi").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_payload"));
    }
}

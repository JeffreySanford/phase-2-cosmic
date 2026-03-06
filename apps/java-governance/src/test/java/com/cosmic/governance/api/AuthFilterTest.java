package com.cosmic.governance.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Verifies the lightweight AuthFilter behavior when authentication is enabled.
 * Runs in a separate context with the property turned on so other tests are
 * unaffected.
 */
@SpringBootTest(properties = {"governance.auth.enabled=true","governance.messaging.enabled=false","governance.redis.enabled=false","governance.audit.rabbit.enabled=false","spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration,org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration,org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration"})
@AutoConfigureMockMvc
class AuthFilterTest {
    @Autowired
    private MockMvc mockMvc;

    // stub policy enforcer that only rejects a token value of "bad"
    @org.springframework.boot.test.context.TestConfiguration
    static class TestConfig {
        @org.springframework.context.annotation.Bean
        public com.cosmic.governance.config.PolicyEnforcer policyEnforcer() {
            return (token, req) -> !"bad".equals(token);
        }
    }

    @Test
    void requestsWithoutHeaderAreRejected() throws Exception {
        mockMvc.perform(get("/api/v1/health").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void requestsWithAuthorizationHeaderSucceed() throws Exception {
        mockMvc.perform(get("/api/v1/health").header("Authorization", "Bearer foo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void requestsWithPolicyRejectedTokenAreForbidden() throws Exception {
        mockMvc.perform(get("/api/v1/health").header("Authorization", "Bearer bad"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("forbidden"));
    }
}

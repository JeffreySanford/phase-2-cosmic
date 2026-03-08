package com.cosmic.governance.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cosmic.governance.test.AbstractRedisTest;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Negative-path tests for the /api/v1/rabbitmq/status and /api/v1/pulsar/status endpoints.
 *
 * <p>RabbitTemplate is mocked so both the happy-path and failure-path can be exercised in isolation.
 * Pulsar is pointed at a dead port so the unavailable-fallback path is exercised regardless of whether
 * a real Pulsar broker is available in the environment.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "pulsar.admin.url=http://localhost:61234")
class BrokerStatusTest extends AbstractRedisTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RabbitTemplate rabbitTemplate;

    // ── RabbitMQ ─────────────────────────────────────────────────────────────

    @Test
    void rabbitmqStatusReturnsHealthyWhenConnected() throws Exception {
        when(rabbitTemplate.execute(any())).thenReturn(null);

        mockMvc.perform(get("/api/v1/rabbitmq/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("healthy"))
                .andExpect(jsonPath("$.connection").value("established"))
                .andExpect(jsonPath("$.lastUpdated").isString());
    }

    @Test
    void rabbitmqStatusReturns503WhenBrokerDown() throws Exception {
        doThrow(new AmqpException("connection refused")).when(rabbitTemplate).execute(any());

        mockMvc.perform(get("/api/v1/rabbitmq/status"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("unavailable"))
                .andExpect(jsonPath("$.connection").value("failed"))
                .andExpect(jsonPath("$.error").isString());
    }

    // ── Pulsar ───────────────────────────────────────────────────────────────

    /**
     * In both local and CI environments Pulsar is not running, so the controller's catch-all
     * handler must kick in and return 200 with status=unavailable rather than propagating a 5xx.
     */
    @Test
    void pulsarStatusReturnsOkEvenWhenBrokerUnreachable() throws Exception {
        mockMvc.perform(get("/api/v1/pulsar/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("unavailable"))
                .andExpect(jsonPath("$.error").isString())
                .andExpect(jsonPath("$.lastUpdated").isString());
    }
}

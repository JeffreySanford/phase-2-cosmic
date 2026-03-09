package com.cosmic.governance.api.service;

import com.cosmic.governance.test.AbstractRedisTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cosmic.governance.api.model.SchedulingBlock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class TridentSchemaTest extends AbstractRedisTest {

    @Autowired
    private SchemaService schemas;

    private final ObjectMapper objectMapper = new ObjectMapper();
    
    private void assertValid(String type, Object payload) {
        var result = schemas.validate(type, payload);
        if (!result.valid()) {
            System.err.println("Validation failed for " + type + ": " + result.message());
        }
        assertThat(result).isNotNull();
        assertThat(result.schemaFound()).isTrue();
        assertThat(result.valid()).isTrue();
    }

    private void assertInvalid(String type, Object payload) {
        var result = schemas.validate(type, payload);
        if (result.valid()) {
            System.err.println("Expected invalid but valid for " + type);
        }
        assertThat(result).isNotNull();
        assertThat(result.schemaFound()).isTrue();
        assertThat(result.valid()).isFalse();
    }
    @Test
    void schedulingBlockSchemaLoadsAndAcceptsValidPayload() throws Exception {
        var schedulingBlock = new SchedulingBlock(
                "sb-1",
                "2026-03-09T00:00:00Z",
                "2026-03-09T01:00:00Z",
                "sub-1",
                Map.of("observer", "trident")
        );
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = objectMapper.convertValue(schedulingBlock, Map.class);
        assertValid("trident.scheduling-block", payload);
        assertThat(objectMapper.readValue(objectMapper.writeValueAsBytes(schedulingBlock), SchedulingBlock.class))
                .isEqualTo(schedulingBlock);
    }

    @Test
    void schedulingBlockMissingRequiredFieldFails() {
        assertInvalid("trident.scheduling-block", Map.of(
            "id", "sb-2",
            "startTime", "2026-03-09T00:00:00Z"
        ));
    }

    @Test
    void executionBlockSchemaLoadsAndAcceptsValidPayload() throws Exception {
        var exec = new com.cosmic.governance.api.model.ExecutionBlock(
                "eb-1", "sb-1", "PENDING", null, null, Map.of());
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = objectMapper.convertValue(exec, Map.class);
        assertValid("trident.execution-block", payload);
    }

    @Test
    void executionBlockMissingRequiredFieldFails() {
        assertInvalid("trident.execution-block", Map.of(
            "id", "eb-2",
            "status", "PENDING"
        ));
    }

    @Test
    void subarrayConfigurationSchemaLoadsAndAcceptsValidPayload() throws Exception {
        var cfg = new com.cosmic.governance.api.model.SubarrayConfiguration(
                "sub-1", java.util.List.of("ant-1", "ant-2"), "standard", Map.of("gain", 1.0)
        );
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = objectMapper.convertValue(cfg, Map.class);
        assertValid("trident.subarray-configuration", payload);
    }

    @Test
    void subarrayConfigurationMissingRequiredFieldFails() {
        assertInvalid("trident.subarray-configuration", Map.of(
            "id", "sub-2"
        ));
    }

    @Test
    void spectralConfigurationSchemaLoadsAndAcceptsValidPayload() throws Exception {
        var spec = new com.cosmic.governance.api.model.SpectralConfiguration(
                "L", 1400000000.0, 1000.0, 1024
        );
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = objectMapper.convertValue(spec, Map.class);
        assertValid("trident.spectral-configuration", payload);
    }

    @Test
    void spectralConfigurationMissingRequiredFieldFails() {
        assertInvalid("trident.spectral-configuration", Map.of(
            "band", "L"
        ));
    }

    @Test
    void fspAllocationPlanSchemaLoadsAndAcceptsValidPayload() throws Exception {
        var alloc = new com.cosmic.governance.api.model.FspAllocationPlan(
                "plan-1", "sub-1", java.util.List.of(Map.of(
                "fspId", "fsp-1",
                "startTime", "2026-03-10T00:00:00Z",
                "endTime", "2026-03-10T00:10:00Z",
                "params", Map.of()
        )));
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = objectMapper.convertValue(alloc, Map.class);
        assertValid("trident.fsp-allocation-plan", payload);
    }

    @Test
    void fspAllocationPlanMissingRequiredFieldFails() {
        assertInvalid("trident.fsp-allocation-plan", Map.of(
            "planId", "plan-2",
            "subarray", "sub-1"
        ));
    }

    @Test
    void allTridentSchemasResolveAtRuntime() {
        for (String schemaType : java.util.List.of(
                "trident.scheduling-block",
                "trident.execution-block",
                "trident.subarray-configuration",
                "trident.spectral-configuration",
                "trident.fsp-allocation-plan"
        )) {
            assertThat(schemas.validate(schemaType, Map.of()).schemaFound())
                    .as("schema should resolve: %s", schemaType)
                    .isTrue();
        }
    }
}

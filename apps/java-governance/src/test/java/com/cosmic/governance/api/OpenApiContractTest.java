package com.cosmic.governance.api;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Lightweight contract/versioning guard for the OpenAPI schema.  These checks
 * should fail if the schema is modified in a backwards-incompatible way
 * without updating the corresponding fixtures or tests.
 */
public class OpenApiContractTest {

    @Test
    public void jobSubmitRequestSchemaContainsExpectedFields() throws Exception {
        InputStream stream = this.getClass().getResourceAsStream("/static/openapi/governance.yaml");
        assertNotNull(stream, "OpenAPI schema must be packaged as a resource");

        Yaml yaml = new Yaml();
        Map<?,?> root = yaml.load(stream);
        assertTrue(root.containsKey("components"), "OpenAPI must define components section");

        Map<?,?> components = (Map<?,?>) root.get("components");
        Map<?,?> schemas = (Map<?,?>) components.get("schemas");
        assertTrue(schemas.containsKey("JobSubmitRequest"), "Schema must include JobSubmitRequest");

        Map<?,?> jobSchema = (Map<?,?>) schemas.get("JobSubmitRequest");
        Map<?,?> props = (Map<?,?>) jobSchema.get("properties");
        assertNotNull(props.get("workflow"), "JobSubmitRequest.schema should declare workflow property");
        assertNotNull(props.get("datasetId"), "JobSubmitRequest.schema should declare datasetId property");
        assertNotNull(props.get("parameters"), "JobSubmitRequest.schema should declare parameters property");

        // ensure ngvlaParams is still optional and exists
        assertNotNull(props.get("ngvlaParams"), "JobSubmitRequest must expose ngvlaParams property for NGVLA extensions");
    }

    @Test
    public void jobSubmitRequestHasDetailsPropertyForBrokerEvents() throws Exception {
        InputStream stream = this.getClass().getResourceAsStream("/static/openapi/governance.yaml");
        Yaml yaml = new Yaml();
        Map<?,?> root = yaml.load(stream);
        Map<?,?> schemas = (Map<?,?>)((Map<?,?>)root.get("components")).get("schemas");
        Map<?,?> jobSchema = (Map<?,?>) schemas.get("JobSubmitRequest");
        Map<?,?> props = (Map<?,?>) jobSchema.get("properties");
        assertNotNull(props.get("details"), "JobSubmitRequest must include 'details' property for event payloads");
    }

    @Test
    public void openapiVersionIsAtLeastOne() throws Exception {
        InputStream stream = this.getClass().getResourceAsStream("/static/openapi/governance.yaml");
        Yaml yaml = new Yaml();
        Map<?,?> root = yaml.load(stream);
        Object version = root.get("openapi");
        assertTrue(version instanceof String, "openapi version should be a string");
        assertTrue(((String)version).startsWith("3"), "we expect OpenAPI 3.x");
    }

    @Test
    public void voServicesEndpointPresentInPaths() throws Exception {
        InputStream stream = this.getClass().getResourceAsStream("/static/openapi/governance.yaml");
        Yaml yaml = new Yaml();
        Map<?,?> root = yaml.load(stream);
        Map<?,?> paths = (Map<?,?>) root.get("paths");
        assertNotNull(paths.get("/api/v1/vo/services"), "OpenAPI must declare /api/v1/vo/services path");
    }
}

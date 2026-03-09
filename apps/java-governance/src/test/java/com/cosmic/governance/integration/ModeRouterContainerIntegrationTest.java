package com.cosmic.governance.integration;

import com.cosmic.governance.service.ModeRouter;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link ModeRouter} that exercises a real HTTP backend
 * running inside a Testcontainers-managed container.  This demonstrates the
 * Docker/Testcontainers harness requested by the PI plan for backend
 * integration tests.
 */
@Testcontainers
public class ModeRouterContainerIntegrationTest {

    // simple public httpbin image which echoes POST bodies
    @Container
    public static GenericContainer<?> httpbin =
            new GenericContainer<>("kennethreitz/httpbin:latest")
                    .withExposedPorts(80);

    @Test
    public void routerCanPostTemplateToBackendStub() throws Exception {
        ModeRouter router = new ModeRouter();
        // pick an arbitrary mode to generate a template
        String template = router.selectTemplate(ModeRouter.JobMode.VLBI);
        assertThat(template).isNotEmpty();

        HttpClient client = HttpClient.newHttpClient();
        String url = String.format("http://%s:%d/post",
                httpbin.getHost(), httpbin.getMappedPort(80));

        HttpRequest req = HttpRequest.newBuilder()
                .uri(new URI(url))
                .header("Content-Type", "text/plain")
                .POST(HttpRequest.BodyPublishers.ofString(template))
                .build();

        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
        assertThat(resp.statusCode()).isEqualTo(200);
        // httpbin returns a JSON object containing the posted data under "data"
        assertThat(resp.body()).contains(template);
    }
}

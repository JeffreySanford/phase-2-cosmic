package com.cosmic.governance.api.messaging;

import com.cosmic.governance.test.AbstractRedisTest;
import org.apache.pulsar.client.api.PulsarClient;
import org.apache.pulsar.client.api.Schema;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class PulsarIngestListenerIntegrationTest extends AbstractRedisTest {

    @Value("${pulsar.service.url:pulsar://localhost:6650}")
    private String pulsarServiceUrl;

    @Value("${governance.pulsar.ingest.topic:phase2-events}")
    private String ingestTopic;

    @Autowired
    private com.cosmic.governance.api.service.JobService jobService;

    @Test
    void validPulsarMessageCreatesJob() throws Exception {
        Assumptions.assumeTrue(isPulsarReachable(pulsarServiceUrl), "Pulsar broker not available for integration test");

        String requestId = UUID.randomUUID().toString();
        String datasetId = "pulsar-ds-" + UUID.randomUUID().toString().substring(0, 8);
        String payload = """
                {
                  "workflow": "ingest",
                  "datasetId": "%s",
                  "parameters": { "requestId": "%s" },
                  "requestedBy": "pulsar-test"
                }
                """.formatted(datasetId, requestId);

        try (PulsarClient client = PulsarClient.builder().serviceUrl(pulsarServiceUrl).build();
             var producer = client.newProducer(Schema.STRING).topic(ingestTopic).create()) {
            producer.send(payload);

            Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(() ->
                    assertThat(jobService.listAll())
                            .anyMatch(job -> datasetId.equals(job.datasetId()) && "ingest".equalsIgnoreCase(job.workflow()))
            );
        }
    }

    private boolean isPulsarReachable(String serviceUrl) {
        String candidate = serviceUrl;
        if (candidate.contains("://")) {
            candidate = candidate.substring(candidate.indexOf("://") + 3);
        }
        String[] hostPort = candidate.split(":");
        if (hostPort.length != 2) {
            return false;
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(hostPort[0], Integer.parseInt(hostPort[1])), 1500);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}

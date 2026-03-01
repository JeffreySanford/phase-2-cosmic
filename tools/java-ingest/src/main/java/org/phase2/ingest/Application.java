package org.phase2.ingest;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    @RestController
    static class HealthController {
        @GetMapping("/health")
        public String health() { return "ok"; }
    }

    // simple consumer for local testing; real logic should be implemented later
    @KafkaListener(topics = "phase2-events", groupId = "java-ingest-group")
    public void onMessage(String msg) {
        System.out.println("[java-ingest] received: " + msg);
    }
}

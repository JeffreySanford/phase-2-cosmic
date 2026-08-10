//go:build integration

// Integration coverage for the collector's Pulsar -> Kafka forward path.
//
// Guarded by the `integration` build tag AND by required environment variables,
// so it never runs in the default unit gate and never fails a machine that has
// no brokers running.
//
// Run against the geo profile from tools/pulsar-collector:
//
//	docker compose -f ../../docker/dev-compose.yml -f ../../docker/geo-collectors-compose.yml \
//	  --profile geo up -d
//	PULSAR_URL=pulsar://localhost:6651 \
//	KAFKA_BOOTSTRAP_SERVERS=localhost:9094 \
//	  go test -tags=integration ./... -run TestCollectorForwards -v
//
// dev-compose exposes Kafka's dedicated HOST listener on 9094 and advertises
// localhost:9094 back to host clients, so this test can run outside the compose
// network without receiving unroutable `kafka:9092` partition metadata.
package main

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/apache/pulsar-client-go/pulsar"
	"github.com/segmentio/kafka-go"
)

func requireEnv(t *testing.T, name string) string {
	t.Helper()
	value := os.Getenv(name)
	if value == "" {
		t.Skipf("%s is not set; skipping collector integration test", name)
	}
	return value
}

// TestCollectorForwardsPulsarToKafkaWithRegionAttribution proves the real bridge:
// one uniquely identified record produced to Pulsar arrives on Kafka with its
// payload intact, collector region recorded, and generator identity unchanged.
func TestCollectorForwardsPulsarToKafkaWithRegionAttribution(t *testing.T) {
	pulsarURL := requireEnv(t, "PULSAR_URL")
	kafkaBrokers := requireEnv(t, "KAFKA_BOOTSTRAP_SERVERS")

	marker := fmt.Sprintf("%d", time.Now().UnixNano())
	pulsarTopic := "phase2-events-it-" + marker
	kafkaTopic := "phase2-events-it-" + marker
	eventID := "e2e-" + marker
	traceID := "trace-it-" + marker

	expectedRegion := os.Getenv("COLLECTOR_REGION")
	if expectedRegion == "" {
		expectedRegion = "it-region"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	collectorCtx, stopCollector := context.WithCancel(ctx)
	defer stopCollector()

	// Unique topics isolate the test from standing regional generators and remove
	// the need for a fragile "attach to topic tail" pre-read.
	cfg := Config{
		Region:       expectedRegion,
		PulsarURL:    pulsarURL,
		PulsarTopic:  pulsarTopic,
		Subscription: "collector-it-" + marker,
		KafkaBrokers: parseBrokers(kafkaBrokers),
		KafkaTopic:   kafkaTopic,
		MetricsAddr:  ":0",
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("invalid integration config: %v", err)
	}

	collectorDone := make(chan error, 1)
	go func() { collectorDone <- run(collectorCtx, cfg) }()

	client, err := pulsar.NewClient(pulsar.ClientOptions{URL: pulsarURL})
	if err != nil {
		t.Fatalf("pulsar client: %v", err)
	}
	defer client.Close()

	producer, err := client.CreateProducer(pulsar.ProducerOptions{Topic: pulsarTopic})
	if err != nil {
		t.Fatalf("pulsar producer: %v", err)
	}
	defer producer.Close()

	payload := []byte(fmt.Sprintf(
		`{"source":"main","eventType":"telemetry.batch","payloadBytes":512,"traceId":"%s"}`,
		traceID))

	if _, err := producer.Send(ctx, &pulsar.ProducerMessage{
		Payload: payload,
		Properties: map[string]string{
			"event-id": eventID,
		},
	}); err != nil {
		t.Fatalf("pulsar send: %v", err)
	}

	// The collector creates this Kafka topic on first forward. Starting from the
	// first offset is deterministic because this topic is unique to the test.
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     parseBrokers(kafkaBrokers),
		Topic:       kafkaTopic,
		MinBytes:    1,
		MaxBytes:    10e6,
		StartOffset: kafka.FirstOffset,
	})
	defer func() { _ = reader.Close() }()

	msg, err := reader.FetchMessage(ctx)
	if err != nil {
		t.Fatalf("did not receive the forwarded record on Kafka: %v", err)
	}

	if string(msg.Value) != string(payload) {
		t.Errorf("payload was not preserved byte-for-byte:\n got: %s\nwant: %s", msg.Value, payload)
	}

	headers := map[string]string{}
	for _, h := range msg.Headers {
		headers[h.Key] = string(h.Value)
	}
	if got := headers["collector-region"]; got != expectedRegion {
		t.Errorf("collector-region header = %q, want %q", got, expectedRegion)
	}
	if got := headers["event-id"]; got != eventID {
		t.Errorf("event-id header = %q, want %q", got, eventID)
	}
	if got := headers["collector-kafka-topic"]; got != kafkaTopic {
		t.Errorf("collector-kafka-topic header = %q, want %q", got, kafkaTopic)
	}
	if headers["collector-pulsar-message-id"] == "" {
		t.Error("expected collector-pulsar-message-id header to be recorded")
	}
	if headers["collector-forwarded-at"] == "" {
		t.Error("expected collector-forwarded-at header to be recorded")
	}

	stopCollector()
	select {
	case err := <-collectorDone:
		if err != nil {
			t.Errorf("collector returned an error during shutdown: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Error("collector did not shut down after context cancellation")
	}
}

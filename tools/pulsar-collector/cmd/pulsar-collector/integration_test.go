//go:build integration

// Integration coverage for the collector's Pulsar -> Kafka forward path.
//
// Guarded by the `integration` build tag AND by required environment variables,
// so it never runs in the default unit gate and never fails a machine that has
// no brokers running.
//
// Run against the geo profile:
//
//	docker compose -f docker/dev-compose.yml -f docker/geo-collectors-compose.yml \
//	  --profile geo up -d
//	PULSAR_URL=pulsar://localhost:6651 \
//	KAFKA_BOOTSTRAP_SERVERS=localhost:9093 \
//	  go test -tags=integration ./... -run TestCollectorForwards -v
//
// Note the Kafka port: 9092 is the in-network listener, 9093 is the
// host-reachable one. A host-side client using 9092 resolves the advertised
// `kafka` hostname and fails.
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

func createTopic(t *testing.T, brokers []string, topic string) {
	t.Helper()

	conn, err := kafka.Dial("tcp", brokers[0])
	if err != nil {
		t.Fatalf("dial kafka %s: %v", brokers[0], err)
	}
	defer func() { _ = conn.Close() }()

	controller, err := conn.Controller()
	if err != nil {
		t.Fatalf("kafka controller: %v", err)
	}

	controllerConn, err := kafka.Dial("tcp", fmt.Sprintf("%s:%d", controller.Host, controller.Port))
	if err != nil {
		t.Fatalf("dial kafka controller: %v", err)
	}
	defer func() { _ = controllerConn.Close() }()

	if err := controllerConn.CreateTopics(kafka.TopicConfig{
		Topic:             topic,
		NumPartitions:     1,
		ReplicationFactor: 1,
	}); err != nil {
		t.Fatalf("create topic %s: %v", topic, err)
	}

	t.Cleanup(func() { _ = controllerConn.DeleteTopics(topic) })
}

func requireEnv(t *testing.T, name string) string {
	t.Helper()
	value := os.Getenv(name)
	if value == "" {
		t.Skipf("%s is not set; skipping collector integration test", name)
	}
	return value
}

// TestCollectorForwardsPulsarToKafkaWithRegionAttribution proves the real bridge:
// a record produced to Pulsar arrives on Kafka with its payload intact and the
// collector's region recorded in headers.
func TestCollectorForwardsPulsarToKafkaWithRegionAttribution(t *testing.T) {
	pulsarURL := requireEnv(t, "PULSAR_URL")
	kafkaBrokers := requireEnv(t, "KAFKA_BOOTSTRAP_SERVERS")

	topic := fmt.Sprintf("phase2-events-it-%d", time.Now().UnixNano())
	expectedRegion := os.Getenv("COLLECTOR_REGION")
	if expectedRegion == "" {
		expectedRegion = "it-region"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	// Create the throwaway topic explicitly. The collector deliberately does not
	// enable Kafka auto-topic-creation, so a typo'd topic fails loudly in
	// production instead of silently creating a new one.
	createTopic(t, parseBrokers(kafkaBrokers), topic)

	// Start a collector against a throwaway topic so the assertion cannot be
	// satisfied by traffic from another producer.
	cfg := Config{
		Region:       expectedRegion,
		PulsarURL:    pulsarURL,
		PulsarTopic:  topic,
		Subscription: "collector-it",
		KafkaBrokers: parseBrokers(kafkaBrokers),
		KafkaTopic:   topic,
		MetricsAddr:  ":0",
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("invalid integration config: %v", err)
	}

	collectorDone := make(chan error, 1)
	go func() { collectorDone <- run(cfg) }()

	client, err := pulsar.NewClient(pulsar.ClientOptions{URL: pulsarURL})
	if err != nil {
		t.Fatalf("pulsar client: %v", err)
	}
	defer client.Close()

	producer, err := client.CreateProducer(pulsar.ProducerOptions{Topic: topic})
	if err != nil {
		t.Fatalf("pulsar producer: %v", err)
	}
	defer producer.Close()

	payload := []byte(fmt.Sprintf(
		`{"source":"main","eventType":"telemetry.batch","payloadBytes":512,"traceId":"it-%d"}`,
		time.Now().UnixNano()))

	if _, err := producer.Send(ctx, &pulsar.ProducerMessage{Payload: payload}); err != nil {
		t.Fatalf("pulsar send: %v", err)
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  parseBrokers(kafkaBrokers),
		Topic:    topic,
		MinBytes: 1,
		MaxBytes: 10e6,
	})
	defer func() { _ = reader.Close() }()

	msg, err := reader.ReadMessage(ctx)
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
	if headers["collector-pulsar-message-id"] == "" {
		t.Error("expected collector-pulsar-message-id header to be recorded")
	}
	if headers["collector-forwarded-at"] == "" {
		t.Error("expected collector-forwarded-at header to be recorded")
	}

	cancel()
	select {
	case <-collectorDone:
	case <-time.After(10 * time.Second):
		t.Error("collector did not shut down after context cancellation")
	}
}

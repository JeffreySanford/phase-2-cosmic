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
// KNOWN LIMITATION: this test does not yet pass when run from the host.
// Kafka advertises its partition leaders on the in-network listener
// (`kafka:9092`), so a host-side client connected on 9093 gets metadata it
// cannot route to and fails with "unexpected EOF". The containerized collectors
// are unaffected because they use the in-network listener.
//
// This test therefore needs to run INSIDE the compose network — as a sidecar
// service on the geo profile or through the existing test-runner container —
// before it can be trusted. It is committed with its assertions complete so the
// remaining work is wiring, not authorship.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
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
// a record produced to Pulsar arrives on Kafka with its payload intact and the
// collector's region recorded in headers.
func TestCollectorForwardsPulsarToKafkaWithRegionAttribution(t *testing.T) {
	pulsarURL := requireEnv(t, "PULSAR_URL")
	kafkaBrokers := requireEnv(t, "KAFKA_BOOTSTRAP_SERVERS")

	// Use the standing topic rather than a throwaway one. Creating a topic
	// requires the Kafka controller's ADVERTISED address, which is the in-network
	// hostname and is not reachable from a host-side test. Isolation comes from a
	// unique marker in the payload instead.
	topic := "phase2-events"
	expectedRegion := os.Getenv("COLLECTOR_REGION")
	if expectedRegion == "" {
		expectedRegion = "it-region"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	// Run a real collector in-process against the same topic the deployed
	// collectors use, on its own subscription so it does not steal their traffic.
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

	marker := fmt.Sprintf("it-%d", time.Now().UnixNano())
	payload := []byte(fmt.Sprintf(
		`{"source":"main","eventType":"telemetry.batch","payloadBytes":512,"traceId":"%s"}`,
		marker))

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     parseBrokers(kafkaBrokers),
		Topic:       topic,
		MinBytes:    1,
		MaxBytes:    10e6,
		StartOffset: kafka.LastOffset,
	})
	defer func() { _ = reader.Close() }()

	// Attach to the tail before producing so the record cannot be missed.
	if _, err := reader.FetchMessage(ctx); err != nil && ctx.Err() != nil {
		t.Fatalf("could not attach to the Kafka topic tail: %v", err)
	}

	if _, err := producer.Send(ctx, &pulsar.ProducerMessage{Payload: payload}); err != nil {
		t.Fatalf("pulsar send: %v", err)
	}

	// Other producers share this topic, so scan for our marker.
	var msg kafka.Message
	for {
		candidate, err := reader.FetchMessage(ctx)
		if err != nil {
			t.Fatalf("did not receive the forwarded record on Kafka: %v", err)
		}
		if strings.Contains(string(candidate.Value), marker) {
			msg = candidate
			break
		}
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

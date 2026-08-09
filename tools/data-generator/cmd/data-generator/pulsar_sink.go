package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/apache/pulsar-client-go/pulsar"
)

// SinkTarget is a parsed --sink value.
//
// Supported forms:
//
//	file:<path>
//	kafka:<broker>:<port>/<topic>
//	pulsar:<host>:<port>/<topic>
type SinkTarget struct {
	Kind    string
	Address string
	Topic   string
}

// parseSinkTarget parses a --sink flag value. An empty value means "no sink",
// which the generator treats as stdout.
func parseSinkTarget(raw string) (SinkTarget, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return SinkTarget{}, nil
	}

	switch {
	case strings.HasPrefix(trimmed, "file:"):
		path := strings.TrimPrefix(trimmed, "file:")
		if path == "" {
			return SinkTarget{}, fmt.Errorf("file sink requires a path: %q", raw)
		}
		return SinkTarget{Kind: "file", Address: path}, nil

	case strings.HasPrefix(trimmed, "kafka:"), strings.HasPrefix(trimmed, "pulsar:"):
		kind, rest, _ := strings.Cut(trimmed, ":")
		// pulsar://host:port/topic is also accepted for familiarity.
		rest = strings.TrimPrefix(rest, "//")
		address, topic, found := strings.Cut(rest, "/")
		if !found || address == "" || topic == "" {
			return SinkTarget{}, fmt.Errorf(
				"invalid %s sink %q, must be %s:<host>:<port>/<topic>", kind, raw, kind)
		}
		return SinkTarget{Kind: kind, Address: address, Topic: topic}, nil
	}

	return SinkTarget{}, fmt.Errorf("unsupported sink %q; supported: file:, kafka:, pulsar:", raw)
}

// PulsarSink publishes generated records to a Pulsar topic. The collectors
// consume that topic and forward to Kafka, so the generator never talks to
// Kafka directly when this sink is selected.
type PulsarSink struct {
	client   pulsar.Client
	producer pulsar.Producer
}

func newPulsarSink(target SinkTarget) (*PulsarSink, error) {
	serviceURL := fmt.Sprintf("pulsar://%s", target.Address)
	client, err := pulsar.NewClient(pulsar.ClientOptions{URL: serviceURL})
	if err != nil {
		return nil, fmt.Errorf("pulsar client for %s: %w", serviceURL, err)
	}

	producer, err := client.CreateProducer(pulsar.ProducerOptions{Topic: target.Topic})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("pulsar producer for topic %s: %w", target.Topic, err)
	}

	return &PulsarSink{client: client, producer: producer}, nil
}

// Send publishes one record. It blocks until the broker acknowledges so a
// delivery failure is reported rather than silently counted as produced.
//
// event-id is generated once at the generator edge and carried as broker
// metadata. The payload stays byte-for-byte unchanged, while downstream hops
// can use event-id as the idempotency/deduplication key.
func (s *PulsarSink) Send(ctx context.Context, payload []byte) error {
	eventID, err := newEventID()
	if err != nil {
		return err
	}

	_, err = s.producer.Send(ctx, &pulsar.ProducerMessage{
		Payload: payload,
		Properties: map[string]string{
			"event-id": eventID,
		},
	})
	return err
}

func newEventID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate event-id: %w", err)
	}

	// UUID v4 variant/version bits. Keeping the implementation in the standard
	// library avoids adding a dependency solely for event identity.
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	hexID := hex.EncodeToString(raw[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hexID[0:8],
		hexID[8:12],
		hexID[12:16],
		hexID[16:20],
		hexID[20:32],
	), nil
}

func (s *PulsarSink) Close() {
	if s.producer != nil {
		s.producer.Close()
	}
	if s.client != nil {
		s.client.Close()
	}
}

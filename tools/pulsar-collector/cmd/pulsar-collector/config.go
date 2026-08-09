package main

import (
	"fmt"
	"strings"
)

// Config describes one collector instance.
//
// A collector is an edge component: it consumes from the Pulsar cluster nearest
// the data source and forwards to the single Kafka backbone. Each deployment
// carries a region so downstream consumers can attribute an event to the
// collector that admitted it.
type Config struct {
	Region       string
	PulsarURL    string
	PulsarTopic  string
	Subscription string
	KafkaBrokers []string
	KafkaTopic   string
	MetricsAddr  string
}

func (c Config) Validate() error {
	var missing []string

	if strings.TrimSpace(c.Region) == "" {
		missing = append(missing, "region")
	}
	if strings.TrimSpace(c.PulsarURL) == "" {
		missing = append(missing, "pulsar-url")
	}
	if strings.TrimSpace(c.PulsarTopic) == "" {
		missing = append(missing, "pulsar-topic")
	}
	if strings.TrimSpace(c.Subscription) == "" {
		missing = append(missing, "subscription")
	}
	if len(c.KafkaBrokers) == 0 {
		missing = append(missing, "kafka-brokers")
	}
	if strings.TrimSpace(c.KafkaTopic) == "" {
		missing = append(missing, "kafka-topic")
	}

	if len(missing) > 0 {
		return fmt.Errorf("missing required collector configuration: %s", strings.Join(missing, ", "))
	}
	return nil
}

// parseBrokers splits a comma-separated broker list, ignoring empty entries so
// a trailing comma or padded environment value does not create a bad address.
func parseBrokers(raw string) []string {
	parts := strings.Split(raw, ",")
	brokers := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			brokers = append(brokers, trimmed)
		}
	}
	return brokers
}

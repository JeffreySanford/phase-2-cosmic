// Command pulsar-collector bridges one edge Pulsar cluster to the Kafka backbone.
//
// Topology:
//
//	data-generator -> Pulsar (edge cluster, per region) -> collector -> Kafka -> consumers
//
// Each collector instance is deployed alongside one geographically distributed
// Pulsar cluster. It preserves the source payload byte-for-byte and records
// attribution in Kafka headers rather than rewriting the message, so the
// forwarded record stays source-faithful.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/apache/pulsar-client-go/pulsar"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/segmentio/kafka-go"
)

var (
	messagesForwarded = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "collector_messages_forwarded_total",
		Help: "Messages successfully forwarded from Pulsar to Kafka",
	}, []string{"region"})
	forwardFailures = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "collector_forward_failures_total",
		Help: "Messages the collector failed to forward to Kafka",
	}, []string{"region"})
	forwardLatency = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "collector_forward_duration_seconds",
		Help:    "Time from Pulsar receive to Kafka acknowledgement",
		Buckets: prometheus.DefBuckets,
	}, []string{"region"})
)

func init() {
	prometheus.MustRegister(messagesForwarded, forwardFailures, forwardLatency)
}

func main() {
	var (
		region       = flag.String("region", envOr("COLLECTOR_REGION", ""), "geographic region label for this collector")
		pulsarURL    = flag.String("pulsar-url", envOr("PULSAR_URL", ""), "Pulsar service URL, such as pulsar://pulsar-eu:6650")
		pulsarTopic  = flag.String("pulsar-topic", envOr("PULSAR_TOPIC", "phase2-events"), "Pulsar topic to consume")
		subscription = flag.String("subscription", envOr("PULSAR_SUBSCRIPTION", "collector"), "Pulsar subscription name")
		kafkaBrokers = flag.String("kafka-brokers", envOr("KAFKA_BOOTSTRAP_SERVERS", ""), "comma-separated Kafka bootstrap servers")
		kafkaTopic   = flag.String("kafka-topic", envOr("KAFKA_TOPIC", "phase2-events"), "Kafka topic to forward to")
		metricsAddr  = flag.String("metrics-addr", envOr("METRICS_ADDR", ":9110"), "metrics listen address")
	)
	flag.Parse()

	cfg := Config{
		Region:       *region,
		PulsarURL:    *pulsarURL,
		PulsarTopic:  *pulsarTopic,
		Subscription: *subscription,
		KafkaBrokers: parseBrokers(*kafkaBrokers),
		KafkaTopic:   *kafkaTopic,
		MetricsAddr:  *metricsAddr,
	}
	if err := cfg.Validate(); err != nil {
		log.Fatalf("[collector] %v", err)
	}

	srv := startMetricsServer(cfg.MetricsAddr)
	defer shutdownMetrics(srv)

	if err := run(cfg); err != nil {
		log.Fatalf("[collector/%s] %v", cfg.Region, err)
	}
}

func run(cfg Config) error {
	client, err := pulsar.NewClient(pulsar.ClientOptions{URL: cfg.PulsarURL})
	if err != nil {
		return err
	}
	defer client.Close()

	consumer, err := client.Subscribe(pulsar.ConsumerOptions{
		Topic:            cfg.PulsarTopic,
		SubscriptionName: cfg.Subscription,
		// Shared lets collector replicas scale horizontally within one region
		// without partition reassignment.
		Type: pulsar.Shared,
	})
	if err != nil {
		return err
	}
	defer consumer.Close()

	writer := &kafka.Writer{
		Addr:     kafka.TCP(cfg.KafkaBrokers...),
		Topic:    cfg.KafkaTopic,
		Balancer: &kafka.LeastBytes{},
	}
	defer func() {
		if cerr := writer.Close(); cerr != nil {
			log.Printf("[collector/%s] kafka writer close: %v", cfg.Region, cerr)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Printf("[collector/%s] forwarding %s (%s) -> %v (%s)",
		cfg.Region, cfg.PulsarURL, cfg.PulsarTopic, cfg.KafkaBrokers, cfg.KafkaTopic)

	for {
		msg, err := consumer.Receive(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				log.Printf("[collector/%s] shutting down", cfg.Region)
				return nil
			}
			return err
		}

		started := time.Now()
		kerr := writer.WriteMessages(ctx, kafka.Message{
			Value:   msg.Payload(),
			Headers: attributionHeaders(cfg.Region, cfg.KafkaTopic, msg),
		})

		if kerr != nil {
			// Negative-ack so Pulsar redelivers instead of losing the record.
			// The collector must not acknowledge what it did not forward.
			consumer.Nack(msg)
			forwardFailures.WithLabelValues(cfg.Region).Inc()
			log.Printf("[collector/%s] forward failed, message will be redelivered: %v", cfg.Region, kerr)
			continue
		}

		if aerr := consumer.Ack(msg); aerr != nil {
			log.Printf("[collector/%s] ack failed: %v", cfg.Region, aerr)
		}
		messagesForwarded.WithLabelValues(cfg.Region).Inc()
		forwardLatency.WithLabelValues(cfg.Region).Observe(time.Since(started).Seconds())
	}
}

// attributionHeaders records which collector admitted the event without
// mutating the payload, keeping the forwarded record source-faithful. event-id
// is generated by the data generator and copied unchanged so consumers can
// perform idempotent processing after any at-least-once redelivery.
func attributionHeaders(region string, kafkaTopic string, msg pulsar.Message) []kafka.Header {
	headers := []kafka.Header{
		{Key: "collector-region", Value: []byte(region)},
		{Key: "collector-pulsar-message-id", Value: []byte(msg.ID().String())},
		{Key: "collector-forwarded-at", Value: []byte(time.Now().UTC().Format(time.RFC3339))},
		{Key: "collector-kafka-topic", Value: []byte(kafkaTopic)},
	}

	if eventID := msg.Properties()["event-id"]; eventID != "" {
		headers = append(headers, kafka.Header{Key: "event-id", Value: []byte(eventID)})
	}

	return headers
}

func startMetricsServer(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[collector] metrics server: %v", err)
		}
	}()
	return srv
}

func shutdownMetrics(srv *http.Server) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/segmentio/kafka-go"
)

var (
	bytesProduced = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "generator_bytes_produced_total",
		Help: "Total bytes produced by generator",
	})
	recordsProduced = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "generator_records_produced_total",
		Help: "Total records produced by generator",
	})
	bytesProducedBySegment = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "generator_bytes_produced_by_segment_total",
		Help: "Total bytes produced by generator grouped by array segment",
	}, []string{"array_segment"})
	recordsProducedBySegment = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "generator_records_produced_by_segment_total",
		Help: "Total records produced by generator grouped by array segment",
	}, []string{"array_segment"})
	// Records that never reached the sink. Produced counters deliberately
	// exclude these so measured throughput reflects delivered bytes only.
	writeFailures = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "generator_write_failures_total",
		Help: "Total records the generator failed to deliver, grouped by sink and array segment",
	}, []string{"sink", "array_segment"})
)

func init() {
	prometheus.MustRegister(bytesProduced)
	prometheus.MustRegister(recordsProduced)
	prometheus.MustRegister(bytesProducedBySegment)
	prometheus.MustRegister(recordsProducedBySegment)
	prometheus.MustRegister(writeFailures)
}

func main() {
	var (
		rate         = flag.Int("rate", 125000, "bytes/sec to emit (approx)")
		payloadSize  = flag.Int("payload-size", 512, "bytes per record")
		duration     = flag.Duration("duration", 0, "total duration (0 = run forever)")
		metricsAddr  = flag.String("metrics-addr", ":9100", "metrics listen address")
		noStdout     = flag.Bool("no-stdout", false, "if set, do not write raw payloads to stdout")
		sinkFlag     = flag.String("sink", "", "sink target; supported: file:<path>, kafka:<host>:<port>/<topic>, pulsar:<host>:<port>/<topic>")
		auditEvery   = flag.Int("audit-every", 1, "write an audit log line every N records (1 = every record)")
		rotateSizeMB = flag.Int("rotate-size-mb", 50, "rotate logs when they exceed this size in MB (0 to disable)")
		segmentDist  = flag.String("segment-distribution", "main:48,lbl:24,sba:21", "comma-separated array segment weights such as main:48,lbl:24,sba:21")
	)
	flag.Parse()

	segments, err := parseSegmentWeights(*segmentDist)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid segment distribution: %v\n", err)
		os.Exit(1)
	}
	// Log the segments being simulated
	segmentNames := make([]string, 0, len(segments))
	for _, s := range segments {
		segmentNames = append(segmentNames, fmt.Sprintf("%s (weight %d)", s.name, s.weight))
	}
	log.Printf("Simulating segments: %s", strings.Join(segmentNames, ", "))

	// Start metrics server
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		// Named distinctly so it does not shadow the outer `err` from
		// parseSegmentWeights, which govet's shadow check flags.
		if _, writeErr := w.Write([]byte("ok")); writeErr != nil {
			log.Printf("health response write error: %v", writeErr)
		}
	})
	srv := &http.Server{Addr: *metricsAddr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		_ = srv.ListenAndServe()
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	// Prepare optional sink writer
	var sinkWriter io.Writer
	var sinkFile *os.File
	var sinkPath string
	var auditWriter *bufio.Writer
	var auditFile *os.File
	var auditPath string
	var recordCounter int64
	var rotateThreshold int64
	var kafkaWriter *kafka.Writer
	var pulsarSink *PulsarSink

	sinkTarget, err := parseSinkTarget(*sinkFlag)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}

	if sinkTarget.Kind == "pulsar" {
		ps, perr := newPulsarSink(sinkTarget)
		if perr != nil {
			fmt.Fprintf(os.Stderr, "failed to create pulsar sink: %v\n", perr)
			os.Exit(1)
		}
		pulsarSink = ps
		defer pulsarSink.Close()
		log.Printf("Pulsar sink enabled: broker=%s topic=%s", sinkTarget.Address, sinkTarget.Topic)
	}

	if strings.HasPrefix(*sinkFlag, "file:") {
		path := strings.TrimPrefix(*sinkFlag, "file:")
		sinkPath = path
		if *rotateSizeMB > 0 {
			rotateThreshold = int64(*rotateSizeMB) * 1024 * 1024
		}
		// ensure directory exists
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			fmt.Fprintf(os.Stderr, "failed to create sink directory: %v\n", err)
			os.Exit(1)
		}
		f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to open sink file: %v\n", err)
			os.Exit(1)
		}
		sinkFile = f
		sinkWriter = f
		// open an English audit log in same dir
		auditPath = filepath.Join(filepath.Dir(path), "payloads.log")
		af, err := os.OpenFile(auditPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to open audit log file: %v\n", err)
			_ = sinkFile.Close()
			os.Exit(1)
		}
		auditFile = af
		auditWriter = bufio.NewWriter(af)
		defer func() {
			_ = auditWriter.Flush()
			_ = auditFile.Sync()
			_ = auditFile.Close()
			_ = sinkFile.Sync()
			_ = sinkFile.Close()
		}()
	} else if strings.HasPrefix(*sinkFlag, "kafka:") {
		// Format: kafka:<broker>:<port>/<topic>
		kafkaUri := strings.TrimPrefix(*sinkFlag, "kafka:")
		parts := strings.SplitN(kafkaUri, "/", 2)
		if len(parts) != 2 {
			fmt.Fprintf(os.Stderr, "invalid kafka sink, must be kafka:<broker>:<port>/<topic>\n")
			os.Exit(1)
		}
		broker := parts[0]
		topic := parts[1]
		kafkaWriter = &kafka.Writer{
			Addr:     kafka.TCP(broker),
			Topic:    topic,
			Balancer: &kafka.LeastBytes{},
		}
		defer func() {
			if err := kafkaWriter.Close(); err != nil {
				log.Printf("Kafka writer close error: %v", err)
			}
		}()
		// Use kafkaWriter as sinkWriter
		sinkWriter = nil // handled separately in main loop
		log.Printf("Kafka sink enabled: broker=%s topic=%s", broker, topic)
	}

	// helper to rotate sink and audit files when threshold is exceeded
	rotateIfNeeded := func() {
		if sinkFile == nil || rotateThreshold <= 0 || sinkPath == "" {
			return
		}
		fi, err := sinkFile.Stat()
		if err != nil {
			return
		}
		if fi.Size() < rotateThreshold {
			return
		}
		// flush and close current files
		if auditWriter != nil {
			_ = auditWriter.Flush()
		}
		_ = sinkFile.Sync()
		_ = sinkFile.Close()
		if auditFile != nil {
			_ = auditFile.Sync()
			_ = auditFile.Close()
		}
		// rotate by renaming with timestamp
		ts := time.Now().UTC().Format("20060102T150405Z")
		rotatedSink := sinkPath + "." + ts
		rotatedAudit := auditPath + "." + ts
		_ = os.Rename(sinkPath, rotatedSink)
		_ = os.Rename(auditPath, rotatedAudit)
		// reopen new files
		f, err := os.OpenFile(sinkPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err == nil {
			sinkFile = f
			sinkWriter = f
		}
		af, err := os.OpenFile(auditPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err == nil {
			auditFile = af
			auditWriter = bufio.NewWriter(af)
		}
	}

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	// per-second loop emit
	log.Printf(
		"data-generator starting: rate=%d B/s payload=%d no-stdout=%v sink=%s segment-distribution=%s",
		*rate,
		*payloadSize,
		*noStdout,
		*sinkFlag,
		*segmentDist,
	)
	start := time.Now()
	for {
		select {
		case <-ctx.Done():
			shutdown(srv)
			return
		case <-ticker.C:
			// emit approximately `rate` bytes this second
			bytesToEmit := *rate
			records := bytesToEmit / *payloadSize
			if records < 1 {
				records = 1
			}
			recordSegments := allocateSegments(records, segments)
			for i := 0; i < records; i++ {
				segment := recordSegments[i]
				// Build valid JSON payload matching backend schema
				traceId := fmt.Sprintf("trace-%s-%03d", time.Now().Format("20060102"), rand.Intn(1000))
				jsonPayload := fmt.Sprintf(`{"source":"%s","eventType":"telemetry.batch","payloadBytes":%d,"traceId":"%s"}`,
					segment, *payloadSize, traceId)
				payloadBytes := []byte(jsonPayload)
				delivered := true
				if sinkWriter != nil {
					_, _ = sinkWriter.Write(payloadBytes)
					if auditWriter != nil {
						recordCounter++
						if *auditEvery <= 1 || (recordCounter%int64(*auditEvery) == 0) {
							ts := time.Now().UTC().Format(time.RFC3339)
							if _, err := fmt.Fprintf(auditWriter, "%s wrote %d bytes to %s (record %d, segment %s)\n", ts, len(payloadBytes), filepath.Base(strings.TrimPrefix(*sinkFlag, "file:")), recordCounter, segment); err != nil {
								log.Printf("audit write error: %v", err)
							}
						}
					}
				} else if pulsarSink != nil {
					if err := pulsarSink.Send(context.Background(), payloadBytes); err != nil {
						log.Printf("Pulsar write error: %v (segment: %s)", err, segment)
						writeFailures.WithLabelValues("pulsar", segment).Inc()
						delivered = false
					}
				} else if kafkaWriter != nil {
					if err := kafkaWriter.WriteMessages(context.Background(), kafka.Message{Value: payloadBytes}); err != nil {
						// Logged per failure only. Logging every success floods
						// stdout at production rates and skews throughput.
						log.Printf("Kafka write error: %v (segment: %s)", err, segment)
						writeFailures.WithLabelValues("kafka", segment).Inc()
						delivered = false
					}
				} else if !*noStdout {
					_, _ = os.Stdout.Write(payloadBytes)
				}
				// Only count what actually reached the sink, so measured
				// throughput is never inflated by failed deliveries.
				if !delivered {
					continue
				}
				bytesProduced.Add(float64(len(payloadBytes)))
				recordsProduced.Inc()
				bytesProducedBySegment.WithLabelValues(segment).Add(float64(len(payloadBytes)))
				recordsProducedBySegment.WithLabelValues(segment).Inc()
			}
			// check for rotation after writing this second's payloads
			rotateIfNeeded()
		}
		if *duration > 0 && time.Since(start) > *duration {
			shutdown(srv)
			return
		}
	}
}

func shutdown(srv *http.Server) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

type segmentWeight struct {
	name   string
	weight int
}

func parseSegmentWeights(raw string) ([]segmentWeight, error) {
	parts := strings.Split(raw, ",")
	segments := make([]segmentWeight, 0, len(parts))
	total := 0
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		pieces := strings.SplitN(trimmed, ":", 2)
		if len(pieces) != 2 {
			return nil, fmt.Errorf("segment entry %q must be name:weight", trimmed)
		}
		name := strings.TrimSpace(pieces[0])
		if name == "" {
			return nil, fmt.Errorf("segment entry %q has empty name", trimmed)
		}
		weight, err := strconv.Atoi(strings.TrimSpace(pieces[1]))
		if err != nil || weight <= 0 {
			return nil, fmt.Errorf("segment %q has invalid weight %q", name, pieces[1])
		}
		segments = append(segments, segmentWeight{name: name, weight: weight})
		total += weight
	}
	if len(segments) == 0 || total <= 0 {
		return nil, fmt.Errorf("at least one positive segment weight is required")
	}
	return segments, nil
}

func allocateSegments(records int, segments []segmentWeight) []string {
	assignments := make([]string, 0, records)
	if records <= 0 || len(segments) == 0 {
		return assignments
	}

	type remainder struct {
		name      string
		remainder int
	}

	totalWeight := 0
	for _, segment := range segments {
		totalWeight += segment.weight
	}

	baseCounts := make(map[string]int, len(segments))
	remainders := make([]remainder, 0, len(segments))
	assigned := 0
	for _, segment := range segments {
		numerator := records * segment.weight
		base := numerator / totalWeight
		baseCounts[segment.name] = base
		assigned += base
		remainders = append(remainders, remainder{
			name:      segment.name,
			remainder: numerator % totalWeight,
		})
	}

	sort.SliceStable(remainders, func(i, j int) bool {
		if remainders[i].remainder == remainders[j].remainder {
			return remainders[i].name < remainders[j].name
		}
		return remainders[i].remainder > remainders[j].remainder
	})

	for i := 0; i < records-assigned; i++ {
		baseCounts[remainders[i%len(remainders)].name]++
	}

	for _, segment := range segments {
		for i := 0; i < baseCounts[segment.name]; i++ {
			assignments = append(assignments, segment.name)
		}
	}

	if len(assignments) == records {
		return assignments
	}

	for len(assignments) < records {
		assignments = append(assignments, segments[len(assignments)%len(segments)].name)
	}
	return assignments
}

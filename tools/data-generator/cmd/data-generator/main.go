package main

import (
	"context"
	"flag"
	"fmt"
	"bufio"
	"io"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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
)

func init() {
	prometheus.MustRegister(bytesProduced)
	prometheus.MustRegister(recordsProduced)
}

func main() {
	var (
		rate        = flag.Int("rate", 125000, "bytes/sec to emit (approx)")
		payloadSize = flag.Int("payload-size", 512, "bytes per record")
		duration    = flag.Duration("duration", 0, "total duration (0 = run forever)")
		metricsAddr = flag.String("metrics-addr", ":9100", "metrics listen address")
		noStdout    = flag.Bool("no-stdout", false, "if set, do not write raw payloads to stdout")
		sinkFlag    = flag.String("sink", "", "sink target; supported: file:<path>")
		auditEvery  = flag.Int("audit-every", 1, "write an audit log line every N records (1 = every record)")
	)
	flag.Parse()

	// Start metrics server
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200); w.Write([]byte("ok")) })
	srv := &http.Server{Addr: *metricsAddr, Handler: mux}
	go func() {
		_ = srv.ListenAndServe()
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	// Prepare optional sink writer
	var sinkWriter io.Writer
	var sinkFile *os.File
	var auditWriter *bufio.Writer
	var auditFile *os.File
	var recordCounter int64
	if strings.HasPrefix(*sinkFlag, "file:") {
		path := strings.TrimPrefix(*sinkFlag, "file:")
		// ensure directory exists
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			fmt.Fprintf(os.Stderr, "failed to create sink directory: %v\n", err)
			os.Exit(1)
		}
		f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to open sink file: %v\n", err)
			os.Exit(1)
		}
		sinkFile = f
		sinkWriter = f
		// open an English audit log in same dir
		auditPath := filepath.Join(filepath.Dir(path), "payloads.log")
		af, err := os.OpenFile(auditPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
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
	}

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	// per-second loop emit
	fmt.Fprintf(os.Stderr, "data-generator starting: rate=%d B/s payload=%d no-stdout=%v sink=%s\n", *rate, *payloadSize, *noStdout, *sinkFlag)
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
			for i := 0; i < records; i++ {
				payload := make([]byte, *payloadSize)
				_, _ = rand.Read(payload)
				// write to configured sink (file) or stdout depending on flags
				if sinkWriter != nil {
					_, _ = sinkWriter.Write(payload)
					// write an English audit line for each record (human-readable)
					if auditWriter != nil {
						recordCounter++
						if *auditEvery <= 1 || (recordCounter%int64(*auditEvery) == 0) {
							ts := time.Now().UTC().Format(time.RFC3339)
							fmt.Fprintf(auditWriter, "%s wrote %d bytes to %s (record %d)\n", ts, len(payload), filepath.Base(strings.TrimPrefix(*sinkFlag, "file:")), recordCounter)
						}
					}
				} else if !*noStdout {
					_, _ = os.Stdout.Write(payload)
				}
				bytesProduced.Add(float64(len(payload)))
				recordsProduced.Inc()
			}
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

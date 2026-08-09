package main

import (
	"os"
	"strconv"

	"github.com/prometheus/client_golang/prometheus"
)

const (
	defaultGeneratorTargetBytesPerSecond = 125000
	defaultGeneratorTargetPayloadBytes   = 512
)

var (
	generatorTargetBytesPerSecond = prometheus.NewGaugeFunc(
		prometheus.GaugeOpts{
			Name: "generator_target_bytes_per_second",
			Help: "Configured generator target throughput in bytes per second",
		},
		func() float64 {
			return envFloat("GENERATOR_TARGET_BYTES_PER_SEC", defaultGeneratorTargetBytesPerSecond)
		},
	)
	generatorTargetPayloadBytes = prometheus.NewGaugeFunc(
		prometheus.GaugeOpts{
			Name: "generator_target_payload_bytes",
			Help: "Configured generator target payload size in bytes",
		},
		func() float64 {
			return envFloat("GENERATOR_TARGET_PAYLOAD_BYTES", defaultGeneratorTargetPayloadBytes)
		},
	)
)

func init() {
	prometheus.MustRegister(generatorTargetBytesPerSecond)
	prometheus.MustRegister(generatorTargetPayloadBytes)
}

func envFloat(name string, fallback float64) float64 {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

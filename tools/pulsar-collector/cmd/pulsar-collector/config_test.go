package main

import (
	"strings"
	"testing"
)

func validConfig() Config {
	return Config{
		Region:       "eu-central",
		PulsarURL:    "pulsar://pulsar-eu:6650",
		PulsarTopic:  "phase2-events",
		Subscription: "collector",
		KafkaBrokers: []string{"kafka:9092"},
		KafkaTopic:   "phase2-events",
		MetricsAddr:  ":9110",
	}
}

func TestConfigValidateAcceptsCompleteConfig(t *testing.T) {
	if err := validConfig().Validate(); err != nil {
		t.Fatalf("expected valid config, got %v", err)
	}
}

func TestConfigValidateReportsEveryMissingField(t *testing.T) {
	// An operator misconfiguring several values should see all of them at once
	// rather than fixing one, redeploying, and hitting the next.
	err := Config{}.Validate()
	if err == nil {
		t.Fatal("expected an error for an empty config")
	}

	for _, want := range []string{
		"region", "pulsar-url", "pulsar-topic",
		"subscription", "kafka-brokers", "kafka-topic",
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("expected error to mention %q, got %q", want, err.Error())
		}
	}
}

func TestConfigValidateRejectsBlankRegion(t *testing.T) {
	cfg := validConfig()
	cfg.Region = "   "

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "region") {
		t.Fatalf("expected a region error for whitespace, got %v", err)
	}
}

func TestParseBrokers(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []string
	}{
		{name: "single", raw: "kafka:9092", want: []string{"kafka:9092"}},
		{
			name: "multiple",
			raw:  "kafka-1:9092,kafka-2:9092",
			want: []string{"kafka-1:9092", "kafka-2:9092"},
		},
		{
			name: "padded and trailing comma",
			raw:  " kafka-1:9092 , kafka-2:9092 ,",
			want: []string{"kafka-1:9092", "kafka-2:9092"},
		},
		{name: "empty", raw: "", want: []string{}},
		{name: "only separators", raw: " , , ", want: []string{}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseBrokers(tc.raw)
			if len(got) != len(tc.want) {
				t.Fatalf("parseBrokers(%q) = %v, want %v", tc.raw, got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("parseBrokers(%q) = %v, want %v", tc.raw, got, tc.want)
				}
			}
		})
	}
}

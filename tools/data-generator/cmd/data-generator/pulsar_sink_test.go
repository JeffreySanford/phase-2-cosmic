package main

import "testing"

func TestParseSinkTarget(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		want    SinkTarget
		wantErr bool
	}{
		{
			name: "empty means stdout",
			raw:  "",
			want: SinkTarget{},
		},
		{
			name: "file sink",
			raw:  "file:logs/payloads.bin",
			want: SinkTarget{Kind: "file", Address: "logs/payloads.bin"},
		},
		{
			name: "kafka sink",
			raw:  "kafka:kafka:9092/phase2-events",
			want: SinkTarget{Kind: "kafka", Address: "kafka:9092", Topic: "phase2-events"},
		},
		{
			name: "pulsar sink",
			raw:  "pulsar:pulsar:6650/phase2-events",
			want: SinkTarget{Kind: "pulsar", Address: "pulsar:6650", Topic: "phase2-events"},
		},
		{
			name: "pulsar sink with scheme separator",
			raw:  "pulsar://pulsar:6650/phase2-events",
			want: SinkTarget{Kind: "pulsar", Address: "pulsar:6650", Topic: "phase2-events"},
		},
		{
			name:    "file sink without path",
			raw:     "file:",
			wantErr: true,
		},
		{
			name:    "kafka sink without topic",
			raw:     "kafka:kafka:9092",
			wantErr: true,
		},
		{
			name:    "pulsar sink with empty topic",
			raw:     "pulsar:pulsar:6650/",
			wantErr: true,
		},
		{
			name:    "unsupported scheme",
			raw:     "rabbitmq:rabbit:5672/queue",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseSinkTarget(tc.raw)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("parseSinkTarget(%q) expected an error, got %+v", tc.raw, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseSinkTarget(%q) unexpected error: %v", tc.raw, err)
			}
			if got != tc.want {
				t.Fatalf("parseSinkTarget(%q) = %+v, want %+v", tc.raw, got, tc.want)
			}
		})
	}
}

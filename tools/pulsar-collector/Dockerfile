FROM golang:1.25 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o /out/pulsar-collector ./cmd/pulsar-collector

FROM debian:bookworm-slim
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/pulsar-collector /usr/local/bin/pulsar-collector
RUN chmod +x /usr/local/bin/pulsar-collector
EXPOSE 9110
# Region, Pulsar URL, and Kafka brokers must be supplied per deployment. The
# collector refuses to start without them rather than guessing a region.
ENV PULSAR_TOPIC=phase2-events \
    KAFKA_TOPIC=phase2-events \
    PULSAR_SUBSCRIPTION=collector \
    METRICS_ADDR=:9110
CMD ["/usr/local/bin/pulsar-collector"]

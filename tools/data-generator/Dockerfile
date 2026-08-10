FROM golang:1.25 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o /out/data-generator ./cmd/data-generator

FROM debian:bookworm-slim
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends fio iperf3 ethtool procps iproute2 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/data-generator /usr/local/bin/data-generator
COPY collect-system-specs.sh /usr/local/bin/collect-system-specs.sh
RUN chmod +x /usr/local/bin/data-generator /usr/local/bin/collect-system-specs.sh
WORKDIR /var/lib/data-generator
VOLUME ["/var/lib/data-generator/logs"]
EXPOSE 9100
ENV GENERATOR_TARGET_BYTES_PER_SEC=125000 \
    GENERATOR_TARGET_PAYLOAD_BYTES=512
CMD ["bash","-lc","/usr/local/bin/collect-system-specs.sh || true; /usr/local/bin/data-generator --rate=${GENERATOR_TARGET_BYTES_PER_SEC} --payload-size=${GENERATOR_TARGET_PAYLOAD_BYTES} --metrics-addr=:9100 --no-stdout --sink=kafka:kafka:9092/phase2-events"]

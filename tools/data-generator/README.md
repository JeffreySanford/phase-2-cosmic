# tools/data-generator

This README describes usage, local scaling, and Kubernetes deployment examples for `data-generator`.

Usage
-----
- Basic: `./data-generator --payload-size=512 --rate=125000`
- Sink to file: `--sink=file:logs/payloads.bin` (creates `payloads.log` alongside)
- Audit frequency: `--audit-every=N` (1 = every record, larger reduces verbosity)
- Rotate size: `--rotate-size-mb=50` (default 50MB)

Local scaling
-------------
- Run multiple instances to use all local cores. Example launcher: `scripts/launch-generators.sh`.
- Per-instance sink to avoid contention:
  `--sink=file:logs/payloads.<id>.bin`
- Tune `--audit-every` and use `--no-stdout` for best performance.

Kubernetes / Production
-----------------------
- Build a container image for `data-generator` and deploy as a `Deployment` with multiple replicas.
- Expose `/metrics` and use Prometheus + Prometheus Adapter to drive an HPA that scales pods by `generator_bytes_produced_total` (or by custom per-pod throughput metric).
- Use node pools with appropriate NIC/IO guarantees and `nodeSelector`/`affinity` to schedule pods onto nodes with 100GbE and NVMe.

See `k8s/` for example manifests and `scripts/launch-generators.sh` for a local launcher.

Diagnostics at container start
---------------------------------
The container now runs a startup diagnostics script that collects passive system specs and writes them to `logs/system-specs.txt` and to container stdout. By default active benchmarks are disabled.

Environment variables:
- `DIAG_RUN=false` (default): when set to `true`, the container will attempt active benchmarks (`fio` and `iperf3`) if those utilities are present.
- `DIAG_IPERF_TARGET`: when `DIAG_RUN=true`, set this to a reachable iperf3 server to run a short network benchmark.

Notes:
- Passive diagnostics (CPU, memory, disk, network info) always run and are light-weight.
- Active benchmarks are optional and may be noisy; they are gated by `DIAG_RUN=true`.


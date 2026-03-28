// scripts/precache-topology.ts
// Precache static topology data in Redis for frontend development/demo

import { createClient } from "redis";
import { Subject } from "rxjs";

const TOPOLOGY_KEY = "frontend:ssr:topology:v1";
const topology = {
  nodes: [
    { id: "backend", label: "Nest SSR", group: "app" },
    { id: "frontend", label: "Angular Frontend", group: "app" },
    { id: "java-governance", label: "Java Governance", group: "app" },
    { id: "java-ingest", label: "Java Ingest", group: "app" },
    { id: "data-generator", label: "Data Generator", group: "app" },
    { id: "kafka", label: "Kafka", group: "infra" },
    { id: "pulsar", label: "Pulsar", group: "infra" },
    { id: "rabbitmq", label: "RabbitMQ", group: "infra" },
    { id: "redis", label: "Redis", group: "infra" },
    { id: "minio", label: "MinIO", group: "infra" },
    { id: "prom", label: "Prometheus", group: "infra" },
    { id: "grafana", label: "Grafana", group: "infra" },
    { id: "loki", label: "Loki", group: "infra" },
    { id: "alertmanager", label: "Alertmanager", group: "infra" },
    { id: "nginx", label: "NGINX (static)", group: "infra" },
    { id: "zookeeper", label: "Zookeeper", group: "infra" },
    { id: "array-main", label: "Main Array (214 x 18m)", group: "ngvla" },
    { id: "array-lbl", label: "Long Baseline (19 x 6m)", group: "ngvla" },
    { id: "array-sba", label: "SBA (19 x 18m)", group: "ngvla" }
  ],
  links: [
    { source: "frontend", target: "backend" },
    { source: "frontend", target: "nginx" },
    { source: "backend", target: "java-governance" },
    { source: "backend", target: "redis" },
    { source: "backend", target: "prom" },
    { source: "data-generator", target: "pulsar" },
    { source: "data-generator", target: "kafka" },
    { source: "data-generator", target: "array-main" },
    { source: "data-generator", target: "array-lbl" },
    { source: "data-generator", target: "array-sba" },
    { source: "pulsar", target: "kafka" },
    { source: "pulsar", target: "java-governance" },
    { source: "zookeeper", target: "kafka" },
    { source: "rabbitmq", target: "java-governance" },
    { source: "kafka", target: "java-governance" },
    { source: "java-governance", target: "rabbitmq" },
    { source: "java-governance", target: "kafka" },
    { source: "java-governance", target: "minio" },
    { source: "java-governance", target: "redis" },
    { source: "kafka", target: "java-ingest" },
    { source: "prom", target: "grafana" },
    { source: "prom", target: "alertmanager" },
    { source: "loki", target: "grafana" },
    { source: "array-main", target: "minio", value: 3 },
    { source: "array-lbl", target: "minio", value: 2 },
    { source: "array-sba", target: "minio", value: 2 }
  ]
};


function precacheTopology$() {
  const subject = new Subject<void>();
  const client = createClient({ url: "redis://localhost:6379" });
  client.connect()
    .then(() => client.set(TOPOLOGY_KEY, JSON.stringify(topology)))
    .then(() => {
      console.log("Precached topology data in Redis.");
      subject.next();
      return client.quit();
    })
    .then(() => subject.complete())
    .catch((err) => {
      subject.error(err);
    });
  return subject;
}

precacheTopology$().subscribe({
  complete: () => process.exit(0),
  error: (err) => {
    console.error(err);
    process.exit(1);
  }
});

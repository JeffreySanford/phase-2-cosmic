# Telemetry Sidebar (Sidecar)

A small, generic sidecar that emits **real-time message emit/receive events** for RabbitMQ/Kafka/Pulsar.

This is designed to be deployed alongside a service (as a sidecar container) and provide a single WebSocket stream that the UI can consume for accurate per-message flash animation.

## ✅ Features

- **RabbitMQ Firehose consumer** (RabbitMQ 3.8+)
- **Kafka consumer** (via KafkaJS)
- **Pulsar consumer** (via pulsar-client)
- Emits a unified JSON event model:
  - `type`: `emit` | `receive`
  - `nodeId`: assigned by sidecar (typically the pod/service name)
  - `broker`: `rabbitmq` / `kafka` / `pulsar`
  - `topicOrQueue`: topic/queue name
  - `timestampMs`: unix ms
  - `bytes`: payload size

## ▶️ Run (dev)

```bash
cd tools/telemetry-sidebar
pnpm install
# Use tsx to run the TypeScript entrypoint directly (no build step required)
pnpm exec tsx src/index.ts -- --rabbitmq amqp://guest:guest@localhost:5672 --nodeId my-service
```

It will open a WebSocket server at `ws://localhost:3333` by default.

## 🧩 Runtime options

- `--rabbitmq <url>`: connect to RabbitMQ and listen to the firehose exchange
- `--kafka <brokers>`: comma-separated bootstrap brokers
- `--pulsar <url>`: Pulsar service URL
- `--nodeId <id>`: node identifier to attach to events
- `--wsPort <port>`: WebSocket port (default 3333)
- `--httpPort <port>`: optional HTTP port to accept producer requests and emit "emit" events (Kafka proxy mode)

## ✅ Output event format

Events are emitted as JSON over WebSocket:

```json
{
  "type": "emit",
  "nodeId": "my-service",
  "broker": "rabbitmq",
  "topicOrQueue": "/vhost/exchange/routing_key",
  "timestampMs": 1690000000000,
  "bytes": 4096
}
```

## Notes

- RabbitMQ Firehose is the most accurate for message-level tracing.
- Kafka & Pulsar connectors currently focus on _receive_ events; emit events can be added by instrumenting the producer path (interceptors) or using a separate producer-side report.

### Kafka producer interceptor example

If you want emit events from the producing side (e.g. inside a service sending messages to Kafka), you can wrap the producer send call and notify the sidecar.

```ts
import { Kafka } from "kafkajs";
import { wrapKafkaProducer } from "./connectors/kafka";

const kafka = new Kafka({ brokers: ["localhost:9092"] });
const producer = kafka.producer();

const telemetryProducer = wrapKafkaProducer(producer, (topic, messages) => {
  // Report to the sidecar via your preferred channel (HTTP, local IPC, etc.)
  // Eg: send to `ws://localhost:3333` using the same event shape.
  console.log("produce", topic, messages.length);
});

await telemetryProducer.connect();
await telemetryProducer.send({ topic: "test", messages: [{ value: "hello" }] });
```

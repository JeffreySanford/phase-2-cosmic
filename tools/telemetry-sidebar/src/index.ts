/* eslint-disable @nx/enforce-module-boundaries */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import WebSocket, { WebSocketServer } from "ws";
import { RabbitMqConnector } from "./connectors/rabbitmq.js";
import { KafkaConnector } from "./connectors/kafka.js";
import { PulsarConnector } from "./connectors/pulsar.js";
import type { TelemetryEvent } from "./types";

const argv = yargs(hideBin(process.argv))
  .option("rabbitmq", { type: "string", describe: "RabbitMQ URL" })
  .option("kafka", { type: "string", describe: "Kafka bootstrap brokers (csv)" })
  .option("pulsar", { type: "string", describe: "Pulsar service URL" })
  .option("mock", { type: "boolean", describe: "Emit mock telemetry events (no broker needed)" })
  .option("nodeId", { type: "string", default: "node", describe: "Node ID to attribute events" })
  .option("wsPort", { type: "number", default: 3333, describe: "WebSocket port" })
  .help()
  .parseSync();

const wss = new WebSocketServer({ port: argv.wsPort });

const connectors: Array<{
  start(): Promise<void>;
  stop(): Promise<void>;
}> = [];

const send = (evt: TelemetryEvent) => {
  const payload = JSON.stringify(evt);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

if (argv.rabbitmq) {
  const conn = new RabbitMqConnector({
    url: argv.rabbitmq,
    nodeId: argv.nodeId,
  });
  conn.subscribe(send);
  connectors.push(conn);
}

if (argv.kafka) {
  const brokers = (argv.kafka as string).split(",").map((s) => s.trim());
  const conn = new KafkaConnector({
    brokers,
    nodeId: argv.nodeId,
    topics: ["#"],
  });
  conn.subscribe(send);
  connectors.push(conn);
}

if (argv.pulsar) {
  const conn = new PulsarConnector({
    serviceUrl: argv.pulsar,
    nodeId: argv.nodeId,
    topics: ["persistent://public/default/#"],
    subscription: `telemetry-sidebar-${argv.nodeId}`,
  });
  conn.subscribe(send);
  connectors.push(conn);
}

const start = async () => {
  console.log(`telemetry-sidebar listening on ws://localhost:${argv.wsPort}`);

  if (argv.mock) {
    let counter = 0;
    setInterval(() => {
      send({
        type: counter % 2 === 0 ? "emit" : "receive",
        nodeId: argv.nodeId,
        broker: "mock",
        topicOrQueue: "mock/topic",
        timestampMs: Date.now(),
        bytes: Math.round(Math.random() * 2048),
      });
      counter += 1;
    }, 200);
  }

  await Promise.all(connectors.map((c) => c.start()));
};

const stop = async () => {
  await Promise.all(connectors.map((c) => c.stop()));
  wss.close();
};

process.on("SIGINT", async () => {
  await stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await stop();
  process.exit(0);
});

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

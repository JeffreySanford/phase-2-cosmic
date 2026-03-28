#!/usr/bin/env node

// Lightweight Kafka proxy that emits telemetry events for both consumes and produces.
// This script is intentionally written in CommonJS to make it easy to run directly
// with `node` (no build step).

const http = require("http");
const WebSocket = require("ws");
const { Kafka } = require("kafkajs");
const yargs = require("yargs/yargs");

const argv = yargs(process.argv.slice(2))
  .option("brokers", {
    type: "string",
    describe: "Kafka bootstrap brokers (comma-separated)",
    default: "localhost:9092",
  })
  .option("nodeId", { type: "string", default: "node", describe: "Node ID to attribute events" })
  .option("wsPort", { type: "number", default: 3333, describe: "WebSocket port" })
  .option("httpPort", {
    type: "number",
    default: 0,
    describe: "HTTP port for producing messages (optional)",
  })
  .option("topics", {
    type: "string",
    default: "#",
    describe: "Topics to consume (comma-separated or wildcard)",
  })
  .help().argv;

const brokers = String(argv.brokers)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const kafka = new Kafka({ brokers });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: `telemetry-sidebar-${argv.nodeId}` });

const wss = new WebSocket.Server({ port: argv.wsPort });

const send = (evt) => {
  const payload = JSON.stringify(evt);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

function bytesForMessage(msg) {
  if (!msg) return 0;
  if (Buffer.isBuffer(msg)) return msg.length;
  if (typeof msg === "string") return Buffer.byteLength(msg, "utf8");
  return 0;
}

async function start() {
  await producer.connect();
  await consumer.connect();

  const topics = String(argv.topics)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await Promise.all(
    topics.map((topic) =>
      consumer.subscribe({ topic, fromBeginning: false })
    )
  );

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const bytes = bytesForMessage(message.value);
      send({
        type: "receive",
        nodeId: argv.nodeId,
        broker: "kafka",
        topicOrQueue: topic,
        timestampMs: Date.now(),
        bytes,
      });
    },
  });

  if (argv.httpPort && argv.httpPort > 0) {
    const server = http.createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/produce") {
        res.writeHead(404);
        res.end();
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const json = JSON.parse(body);
          const topic = String(json.topic || "");
          const messages = Array.isArray(json.messages) ? json.messages : [];

          if (!topic) {
            res.writeHead(400);
            res.end("missing topic");
            return;
          }

          await producer.send({ topic, messages });

          // Emit telemetry for each message produced.
          const totalBytes = messages.reduce(
            (acc, msg) => acc + bytesForMessage(msg.value),
            0
          );
          send({
            type: "emit",
            nodeId: argv.nodeId,
            broker: "kafka",
            topicOrQueue: topic,
            timestampMs: Date.now(),
            bytes: totalBytes,
          });

          res.writeHead(200);
          res.end("ok");
        } catch (err) {
          res.writeHead(500);
          res.end(String(err));
        }
      });
    });

    server.listen(argv.httpPort);
    console.log(`Kafka proxy HTTP produce endpoint listening on http://localhost:${argv.httpPort}/produce`);
  }

  console.log(`Kafka telemetry proxy listening on ws://localhost:${argv.wsPort}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

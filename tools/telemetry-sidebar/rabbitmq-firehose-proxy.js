#!/usr/bin/env node

// Lightweight RabbitMQ firehose -> WebSocket proxy.
// This script is intentionally small and uses only runtime JS so it can be executed
// without TypeScript compilation tools (useful for quick smoke tests).

const WebSocket = require("ws");
const amqplib = require("amqplib");

const argv = require("yargs/yargs")(process.argv.slice(2))
  .option("rabbitmq", {
    type: "string",
    describe: "RabbitMQ URL",
    default: "amqp://guest:guest@localhost:5672",
  })
  .option("wsPort", { type: "number", default: 3333 })
  .option("nodeId", { type: "string", default: "node" })
  .option("exchange", {
    type: "string",
    default: "amq.rabbitmq.trace",
    describe: "RabbitMQ firehose exchange name",
  })
  .help().argv;

const wss = new WebSocket.Server({ port: argv.wsPort });

const send = (evt) => {
  const payload = JSON.stringify(evt);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

async function start() {
  const conn = await amqplib.connect(argv.rabbitmq);
  const chan = await conn.createChannel();

  await chan.assertExchange(argv.exchange, "topic", {
    durable: false,
    autoDelete: true,
  });

  const { queue } = await chan.assertQueue("", { exclusive: true });
  await chan.bindQueue(queue, argv.exchange, "#");

  chan.consume(queue, (msg) => {
    if (!msg) return;
    try {
      const parsed = JSON.parse(msg.content.toString());
      const { routing_key, exchange, payload_bytes, name, vhost } = parsed;
      const bytes =
        typeof payload_bytes === "number"
          ? payload_bytes
          : Number(payload_bytes ?? 0);
      const topicOrQueue = `${vhost}/${exchange}/${routing_key}`;
      if (name === "basic.publish") {
        send({
          type: "emit",
          nodeId: argv.nodeId,
          broker: "rabbitmq",
          topicOrQueue,
          timestampMs: Date.now(),
          bytes,
        });
      } else if (name === "basic.deliver") {
        send({
          type: "receive",
          nodeId: argv.nodeId,
          broker: "rabbitmq",
          topicOrQueue,
          timestampMs: Date.now(),
          bytes,
        });
      }
    } catch {
      // ignore
    }
  });

  console.log(
    `RabbitMQ firehose proxy running on ws://localhost:${argv.wsPort}`
  );
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

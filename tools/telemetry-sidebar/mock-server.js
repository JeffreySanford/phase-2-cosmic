#!/usr/bin/env node

const WebSocket = require("ws");

const port = Number(process.argv[2] || 3333);
const nodeId = process.argv[3] || "mock-node";

const wss = new WebSocket.Server({ port });
console.log(`mock telemetry server listening on ws://localhost:${port}`);

const send = (evt) => {
  const payload = JSON.stringify(evt);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(payload);
    }
  });
};

let counter = 0;
setInterval(() => {
  const evt = {
    type: counter % 2 === 0 ? "emit" : "receive",
    nodeId,
    broker: "mock",
    topicOrQueue: "mock/topic",
    timestampMs: Date.now(),
    bytes: Math.round(Math.random() * 2048),
  };
  send(evt);
  counter += 1;
}, 200);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

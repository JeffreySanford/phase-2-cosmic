/* eslint-disable @nx/enforce-module-boundaries */

import type { TelemetryConnector, TelemetryEvent } from "../types";

export type RabbitMqConnectorOptions = {
  url: string;
  nodeId: string;
  /** rabbitmq firehose exchange name */
  exchange?: string;
  /** optional queues to ignore */
  ignoreQueues?: string[];
};

export class RabbitMqConnector implements TelemetryConnector {
  private conn?: import("amqplib").Connection;
  private chan?: import("amqplib").Channel;
  private readonly opts: RabbitMqConnectorOptions;

  constructor(opts: RabbitMqConnectorOptions) {
    this.opts = { exchange: "amq.rabbitmq.trace", ignoreQueues: [], ...opts };
  }

  async start() {
    const amqplib = await import("amqplib");
    this.conn = await amqplib.connect(this.opts.url);
    this.chan = await this.conn.createChannel();

    // Firehose exchange is typically 'amq.rabbitmq.trace'
    // The RabbitMQ firehose exchange is typically durable; avoid precondition failures.
    await this.chan.assertExchange(this.opts.exchange ?? "amq.rabbitmq.trace", "topic", {
      durable: true,
      autoDelete: false,
      internal: true,
    });

    const { queue } = await this.chan.assertQueue("", { exclusive: true });
    await this.chan.bindQueue(queue, this.opts.exchange ?? "amq.rabbitmq.trace", "#");

    this.chan.consume(queue, (msg: import("amqplib").Message | null) => {
      if (!msg) return;
      try {
        const parsed = JSON.parse(msg.content.toString());
        const event = this.translateTrace(parsed);
        if (event) {
          this.onEvent?.(event);
        }
      } catch {
        // ignore parse errors
      }
    });
  }

  private translateTrace(trace: Record<string, unknown>): TelemetryEvent | undefined {
    // firehose trace format is documented by rabbitmq; this is a minimal
    // implementation that captures publish/consume events.
    const { routing_key, exchange, payload_bytes, name, vhost } = trace;
    const node = this.opts.nodeId;

    const bytes = typeof payload_bytes === "number" ? payload_bytes : Number(payload_bytes ?? 0);

    if (name === "basic.publish") {
      return {
        type: "emit",
        nodeId: node,
        broker: "rabbitmq",
        topicOrQueue: `${vhost}/${exchange}/${routing_key}`,
        timestampMs: Date.now(),
        bytes,
      };
    }

    if (name === "basic.deliver") {
      return {
        type: "receive",
        nodeId: node,
        broker: "rabbitmq",
        topicOrQueue: `${vhost}/${exchange}/${routing_key}`,
        timestampMs: Date.now(),
        bytes,
      };
    }

    return undefined;
  }

  private onEvent?: (evt: TelemetryEvent) => void;

  subscribe(cb: (evt: TelemetryEvent) => void) {
    this.onEvent = cb;
  }

  async stop() {
    await this.chan?.close?.();
    await this.conn?.close?.();
  }
}

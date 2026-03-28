/* eslint-disable @nx/enforce-module-boundaries */

import type { Client, Consumer } from "pulsar-client";
import type { TelemetryConnector, TelemetryEvent } from "../types";

export type PulsarConnectorOptions = {
  serviceUrl: string;
  nodeId: string;
  topics: string[];
  subscription: string;
};

export class PulsarConnector implements TelemetryConnector {
  private readonly opts: PulsarConnectorOptions;
  private client?: Client;
  private consumer?: Consumer;
  private onEvent?: (evt: TelemetryEvent) => void;

  constructor(opts: PulsarConnectorOptions) {
    this.opts = opts;
  }

  async start() {
    const Pulsar = await import("pulsar-client");
    this.client = new Pulsar.Client({ serviceUrl: this.opts.serviceUrl });

    this.consumer = await this.client.subscribe({
      topic: this.opts.topics,
      subscription: this.opts.subscription,
      subscriptionType: "Shared",
    });

    const consumer = this.consumer;
    if (!consumer) return;

    const loop = async () => {
      while (true) {
        const msg = await consumer.receive();
        const bytes = msg.getData().length;
        this.onEvent?.({
          type: "receive",
          nodeId: this.opts.nodeId,
          broker: "pulsar",
          topicOrQueue: msg.getTopicName(),
          timestampMs: Date.now(),
          bytes,
        });
        await consumer.acknowledge(msg);
      }
    };

    loop().catch(() => {
      // swallow errors for now
    });
  }

  subscribe(cb: (evt: TelemetryEvent) => void) {
    this.onEvent = cb;
  }

  async stop() {
    await this.consumer?.close();
    await this.client?.close();
  }
}

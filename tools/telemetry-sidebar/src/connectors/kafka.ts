/* eslint-disable @nx/enforce-module-boundaries */

import type { EachMessagePayload } from "kafkajs";
import type { TelemetryConnector, TelemetryEvent } from "../types";

// Minimal typed surface of the kafka-js consumer we use.
interface KafkaConsumerLike {
  connect(): Promise<void>;
  subscribe(opts: { topics: string[]; fromBeginning: boolean }): Promise<void>;
  run(opts: { eachMessage: (payload: EachMessagePayload) => Promise<void> }): Promise<void>;
  disconnect(): Promise<void>;
}

interface KafkaProducerLike {
  send(record: { topic: string; messages: KafkaMessage[] }): Promise<unknown>;
}

type KafkaMessage = {
  key?: Buffer | string | null;
  value: Buffer | string | null;
};

type KafkaProducerRecord = {
  topic: string;
  messages: KafkaMessage[];
};

export type KafkaConnectorOptions = {
  brokers: string[];
  nodeId: string;
  groupId?: string;
  topics: string[];
};

export class KafkaConnector implements TelemetryConnector {
  private readonly opts: KafkaConnectorOptions;
  private consumer?: KafkaConsumerLike;
  private onEvent?: (evt: TelemetryEvent) => void;

  constructor(opts: KafkaConnectorOptions) {
    this.opts = opts;
  }

  async start() {
    const { Kafka } = await import("kafkajs");
    const kafka = new Kafka({ brokers: this.opts.brokers });

    // Consumer for incoming (receive) events
    this.consumer = kafka.consumer({ groupId: this.opts.groupId ?? "telemetry-sidebar" }) as KafkaConsumerLike;
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: this.opts.topics, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ topic, message }: EachMessagePayload) => {
        const bytes = message.value ? (message.value as Buffer).length : 0;
        this.onEvent?.({
          type: "receive",
          nodeId: this.opts.nodeId,
          broker: "kafka",
          topicOrQueue: topic,
          timestampMs: Date.now(),
          bytes,
        });
      },
    });

    // Optional: intercept producer sends if you can wrap the producing code.
    // This sidecar can't automatically detect all emits unless you wire it into the producer.
  }

  subscribe(cb: (evt: TelemetryEvent) => void) {
    this.onEvent = cb;
  }

  async stop() {
    await this.consumer?.disconnect();
  }
}

/**
 * Example helper: wrap a Kafka producer to emit telemetry events on send.
 *
 * Use this when you control the producing code and want the sidecar to report "emit" activity.
 */
export function wrapKafkaProducer(
  producer: KafkaProducerLike,
  onProduce: (topic: string, messages: KafkaMessage[]) => void
): KafkaProducerLike {
  const originalSend = producer.send.bind(producer);
  producer.send = async (record: KafkaProducerRecord) => {
    try {
      const topic = String(record.topic ?? "");
      const messages = Array.isArray(record.messages) ? record.messages : [];
      onProduce(topic, messages);
    } catch {
      // ignore
    }
    return originalSend(record);
  };
  return producer;
}

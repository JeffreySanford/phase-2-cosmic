// Allow building even when the optional broker client libraries are not installed.
// In environments where those dependencies are present, these fallbacks are ignored.

declare module "kafkajs" {
  export type EachMessagePayload = {
    topic: string;
    partition: number;
    message: {
      value: Buffer | null;
      key: Buffer | null;
    };
  };
  export class Kafka {
    constructor(opts: { brokers: string[] });
    consumer(opts: { groupId: string }): {
      connect(): Promise<void>;
      subscribe(opts: { topics: string[]; fromBeginning: boolean }): Promise<void>;
      run(opts: { eachMessage: (payload: EachMessagePayload) => Promise<void> }): Promise<void>;
      disconnect(): Promise<void>;
    };
  }
}

declare module "pulsar-client" {
  export class Client {
    constructor(opts: { serviceUrl: string });
    subscribe(opts: {
      topic: string | string[];
      subscription: string;
      subscriptionType: "Shared" | "Exclusive" | "Failover";
    }): Promise<Consumer>;
    close(): Promise<void>;
  }

  export class Consumer {
    receive(): Promise<Message>;
    acknowledge(msg: Message): Promise<void>;
    close(): Promise<void>;
  }

  export type Message = {
    getData(): Buffer;
    getTopicName(): string;
  };
}

declare module "amqplib" {
  export type Connection = {
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
  };

  export type Channel = {
    assertExchange(name: string, type: string, opts: Record<string, unknown>): Promise<void>;
    assertQueue(q: string, opts: Record<string, unknown>): Promise<{ queue: string }>;
    bindQueue(queue: string, exchange: string, pattern: string): Promise<void>;
    consume(queue: string, cb: (msg: Message | null) => void): Promise<void>;
    close(): Promise<void>;
  };

  export type Message = {
    content: Buffer;
  };

  export function connect(url: string): Promise<Connection>;
}

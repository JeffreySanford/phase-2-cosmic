export type TelemetryEvent = {
  type: "emit" | "receive";
  nodeId: string; // the logical service/node
  broker: "rabbitmq" | "kafka" | "pulsar" | string;
  topicOrQueue: string;
  timestampMs: number;
  bytes?: number;
  meta?: Record<string, unknown>;
};

export type TelemetryConnectorOptions = {
  broker: "rabbitmq" | "kafka" | "pulsar";
  url: string;
  nodeId: string;
  /** export port for the websocket server */
  websocketPort?: number;
};

export type TelemetryConnector = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

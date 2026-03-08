// Shared type definitions for the application

export interface PulsarStatus {
  brokers: number;
  topics: number;
  partitions: number;
}

export interface RabbitMQStatus {
  status: string;
  connection: string;
  queues?: Record<string, unknown>;
  exchanges?: Record<string, unknown>;
  error?: string;
}

export interface DiagnosticsIndex {
  path: string;
  files: string[];
}

export interface DockerServiceStatus {
  name: string;
  status: "online" | "degraded" | "offline" | "unknown";
  details?: string;
  error?: string;
  latencyMs?: number;
  icon?: string;
}

export interface CommissioningScenario {
  id: string;
  name: string;
  type: string;
  description: string;
  requiredParameters: string[];
}

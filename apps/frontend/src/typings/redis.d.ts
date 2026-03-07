declare module "redis" {
  export type RedisClientType = {
    connect?: () => Promise<void>;
    disconnect?: () => Promise<void>;
  } & Record<string, unknown>;
  export function createClient(opts?: Record<string, unknown>): RedisClientType;
}

declare module 'redis' {
  export type RedisClientType = any;
  export function createClient(opts?: any): RedisClientType;
}

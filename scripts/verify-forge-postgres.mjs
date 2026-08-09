#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const host = process.env.PGHOST || "127.0.0.1";
const port = Number(process.env.PGPORT || process.env.FORGE_POSTGRES_HOST_PORT || 55432);
const user = process.env.PGUSER || process.env.FORGE_POSTGRES_USER || "cosmic_forge";
const password = process.env.PGPASSWORD || process.env.FORGE_POSTGRES_PASSWORD;
const database = process.env.PGDATABASE || process.env.FORGE_POSTGRES_DB || "cosmic_forge";

if (!password) {
  console.error("[forge-postgres] host-side verification skipped: password is not configured");
  process.exit(2);
}

const client = new Client({
  host,
  port,
  user,
  password,
  database,
  connectionTimeoutMillis: 5000,
});

try {
  await client.connect();
  const result = await client.query("SELECT current_database() AS database_name, current_user AS user_name");
  const row = result.rows[0] ?? {};
  console.log(
    `[forge-postgres] host-side node-postgres connection verified (${host}:${port}/${row.database_name ?? database} as ${row.user_name ?? user})`
  );
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
  console.error(
    `[forge-postgres] host-side node-postgres verification failed (${host}:${port}/${database}, code=${String(code)})`
  );
  // 28 is reserved here for PostgreSQL SQLSTATE 28P01 (invalid_password) so
  // the shell wrapper can perform one local-admin password reset and retry the
  // actual host path. Other failures remain a generic nonzero exit.
  process.exitCode = code === "28P01" ? 28 : 1;
} finally {
  await client.end().catch(() => undefined);
}

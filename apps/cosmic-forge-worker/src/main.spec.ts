import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

function loadWorkerModule(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const modulePath = require.resolve("./main");
  delete require.cache[modulePath];
  return require("./main") as typeof import("./main");
}

function listen(serverApp: import("express").Express): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = serverApp.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function getJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

test("worker health reports the last successful execute-next result", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/claim-next")) {
      return {
        ok: true,
        json: async () => ({
          claimedAt: "2026-03-28T12:00:00.000Z",
          contractVersion: "forge-worker.v1",
          job: {
            id: "forge-job-99",
            status: "RUNNING",
          },
        }),
      } as Response;
    }

    return {
      ok: true,
      json: async () => ({
        completedAt: "2026-03-28T12:00:01.000Z",
        contractVersion: "forge-worker.v1",
        resultStatus: "COMPLETED",
        job: {
          id: "forge-job-99",
          status: "COMPLETED",
        },
      }),
    } as Response;
  }) as typeof fetch;

  const { app, executeNext } = loadWorkerModule({
    FORGE_API_URL: "http://127.0.0.1:4111",
    FORGE_WORKER_POLL_MS: "1000",
    FORGE_WORKER_ID: "cosmic-forge-worker-99",
  });

  await executeNext();
  const server = await listen(app);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unexpected server address");
    }

    const health = await getJson(`http://127.0.0.1:${address.port}/health`);

    assert.equal(health["status"], "ok");
    assert.equal(health["forgeApiUrl"], "http://127.0.0.1:4111");
    assert.equal(health["pollIntervalMs"], 1000);
    assert.equal(health["contractVersion"], "forge-worker.v1");
    assert.equal(health["workerId"], "cosmic-forge-worker-99");
    assert.equal(health["lastExecutionAt"], "2026-03-28T12:00:01.000Z");
    assert.equal(health["lastClaimAt"], "2026-03-28T12:00:00.000Z");
    assert.equal(health["lastClaimedJobId"], "forge-job-99");
    assert.equal(health["totalClaims"], 1);
    assert.equal(health["totalCompletions"], 1);
    assert.equal(health["totalFailures"], 0);
    assert.deepEqual(health["activeJobIds"], []);
    assert.equal(health["lastExecutionError"], null);
  } finally {
    await close(server);
    global.fetch = originalFetch;
  }
});

test("worker health reports the last claim failure", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as Response) as typeof fetch;

  const { app, executeNext } = loadWorkerModule({
    FORGE_API_URL: "http://127.0.0.1:4222",
    FORGE_WORKER_POLL_MS: "2500",
    FORGE_WORKER_ID: "cosmic-forge-worker-404",
  });

  await executeNext();
  const server = await listen(app);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unexpected server address");
    }

    const health = await getJson(`http://127.0.0.1:${address.port}/health`);

    assert.equal(health["status"], "ok");
    assert.equal(health["contractVersion"], "forge-worker.v1");
    assert.equal(health["lastExecutionAt"], null);
    assert.equal(health["activeExecutionCount"], 0);
    assert.equal(health["totalClaims"], 0);
    assert.equal(health["totalFailures"], 0);
    assert.equal(health["lastExecutionError"], "worker claim-next failed: 404");
  } finally {
    await close(server);
    global.fetch = originalFetch;
  }
});

test("worker health reports bounded-concurrency settings", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        claimedAt: "2026-03-28T12:00:00.000Z",
        contractVersion: "forge-worker.v1",
        job: null,
      }),
    }) as Response) as typeof fetch;

  const { app, pumpQueue } = loadWorkerModule({
    FORGE_API_URL: "http://127.0.0.1:4333",
    FORGE_WORKER_POLL_MS: "1500",
    FORGE_WORKER_MAX_CONCURRENCY: "3",
    FORGE_WORKER_ID: "cosmic-forge-worker-3",
  });

  await pumpQueue();
  const server = await listen(app);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unexpected server address");
    }

    const health = await getJson(`http://127.0.0.1:${address.port}/health`);

    assert.equal(health["maxConcurrency"], 3);
    assert.equal(health["pollIntervalMs"], 1500);
    assert.equal(health["workerId"], "cosmic-forge-worker-3");
  } finally {
    await close(server);
    global.fetch = originalFetch;
  }
});

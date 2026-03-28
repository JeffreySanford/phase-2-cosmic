import express, { type Express } from "express";

type ExecuteNextResponse = Readonly<{
  executedAt?: string;
  activeJobId?: string | null;
}>;

type WorkerState = {
  lastExecutionAt: string | null;
  lastExecutionError: string | null;
  currentActiveJobId: string | null;
  workerTimer: NodeJS.Timeout | null;
};

const app: Express = express();
const PORT = Number(process.env["PORT"] || process.env["FORGE_WORKER_HOST_PORT"] || "4102");
const FORGE_API_URL =
  process.env["FORGE_API_URL"] ||
  `http://127.0.0.1:${process.env["FORGE_API_HOST_PORT"] || "4101"}`;
const POLL_INTERVAL_MS = Number(process.env["FORGE_WORKER_POLL_MS"] || "5000");

const state: WorkerState = {
  lastExecutionAt: null,
  lastExecutionError: null,
  currentActiveJobId: null,
  workerTimer: null,
};

async function executeNext(): Promise<void> {
  try {
    const response = await fetch(`${FORGE_API_URL}/internal/worker/execute-next`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`worker execute-next failed: ${response.status}`);
    }

    const body = (await response.json()) as ExecuteNextResponse;
    state.lastExecutionAt = body.executedAt || new Date().toISOString();
    state.currentActiveJobId = body.activeJobId || null;
    state.lastExecutionError = null;
  } catch (error) {
    state.lastExecutionError = error instanceof Error ? error.message : String(error);
  }
}

function startWorkerLoop(): void {
  if (state.workerTimer) {
    return;
  }

  state.workerTimer = setInterval(() => {
    void executeNext();
  }, POLL_INTERVAL_MS);

  void executeNext();
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cosmic-forge-worker",
    forgeApiUrl: FORGE_API_URL,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastExecutionAt: state.lastExecutionAt,
    activeJobId: state.currentActiveJobId,
    lastExecutionError: state.lastExecutionError,
  });
});

async function bootstrap(): Promise<void> {
  startWorkerLoop();
  app.listen(PORT, () => {
    console.log(`Cosmic Forge Worker listening on port ${PORT}`);
  });
}

if (require.main === module) {
  void bootstrap();
}

export { app, bootstrap, executeNext };

import express, { type Express } from "express";

type WorkerJob = Readonly<{
  id: string;
  status: string;
}>;

type ClaimNextResponse = Readonly<{
  claimedAt?: string;
  contractVersion?: string;
  job?: WorkerJob | null;
}>;

type ExecuteJobResponse = Readonly<{
  completedAt?: string;
  contractVersion?: string;
  resultStatus?: string | null;
  job?: WorkerJob | null;
}>;

type WorkerState = {
  lastExecutionAt: string | null;
  lastExecutionError: string | null;
  lastExecutionDurationMs: number | null;
  currentActiveJobIds: string[];
  workerTimer: NodeJS.Timeout | null;
  pumpInProgress: boolean;
  pumpPending: boolean;
  totalClaims: number;
  totalCompletions: number;
  totalFailures: number;
  lastClaimAt: string | null;
  lastClaimedJobId: string | null;
};

const app: Express = express();
app.use(express.json());

const PORT = Number(
  process.env["PORT"] || process.env["FORGE_WORKER_HOST_PORT"] || "4102"
);
const FORGE_API_URL =
  process.env["FORGE_API_URL"] ||
  `http://127.0.0.1:${process.env["FORGE_API_HOST_PORT"] || "4101"}`;
const POLL_INTERVAL_MS = Number(process.env["FORGE_WORKER_POLL_MS"] || "3000");
const MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env["FORGE_WORKER_MAX_CONCURRENCY"] || "2")
);
const WORKER_ID =
  process.env["FORGE_WORKER_ID"] ||
  `cosmic-forge-worker-${process.pid.toString(10)}`;
const WORKER_CONTRACT_VERSION = "forge-worker.v1";

const state: WorkerState = {
  lastExecutionAt: null,
  lastExecutionError: null,
  lastExecutionDurationMs: null,
  currentActiveJobIds: [],
  workerTimer: null,
  pumpInProgress: false,
  pumpPending: false,
  totalClaims: 0,
  totalCompletions: 0,
  totalFailures: 0,
  lastClaimAt: null,
  lastClaimedJobId: null,
};

function addActiveJob(jobId: string): void {
  if (!state.currentActiveJobIds.includes(jobId)) {
    state.currentActiveJobIds = [...state.currentActiveJobIds, jobId];
  }
}

function removeActiveJob(jobId: string): void {
  state.currentActiveJobIds = state.currentActiveJobIds.filter(
    (id) => id !== jobId
  );
}

async function claimNextJob(): Promise<WorkerJob | null> {
  const response = await fetch(`${FORGE_API_URL}/internal/worker/claim-next`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workerId: WORKER_ID,
    }),
  });
  if (!response.ok) {
    throw new Error(`worker claim-next failed: ${response.status}`);
  }

  const body = (await response.json()) as ClaimNextResponse;
  state.lastClaimAt = body.claimedAt || new Date().toISOString();
  state.lastClaimedJobId = body.job?.id ?? null;
  return body.job ?? null;
}

async function executeJob(jobId: string): Promise<void> {
  const startedAt = Date.now();
  addActiveJob(jobId);

  try {
    const response = await fetch(
      `${FORGE_API_URL}/internal/worker/jobs/${jobId}/execute`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workerId: WORKER_ID,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`worker execute-job failed: ${response.status}`);
    }

    const body = (await response.json()) as ExecuteJobResponse;
    state.lastExecutionAt = body.completedAt || new Date().toISOString();
    state.lastExecutionDurationMs = Date.now() - startedAt;
    state.lastExecutionError = null;

    if (body.resultStatus === "FAILED") {
      state.totalFailures += 1;
    } else {
      state.totalCompletions += 1;
    }
  } catch (error) {
    state.lastExecutionDurationMs = Date.now() - startedAt;
    state.lastExecutionError =
      error instanceof Error ? error.message : String(error);
    state.totalFailures += 1;
  } finally {
    removeActiveJob(jobId);
    if (state.workerTimer) {
      queueMicrotask(() => {
        void pumpQueue();
      });
    }
  }
}

async function pumpQueue(): Promise<void> {
  if (state.pumpInProgress) {
    state.pumpPending = true;
    return;
  }

  state.pumpInProgress = true;
  try {
    while (state.currentActiveJobIds.length < MAX_CONCURRENCY) {
      const job = await claimNextJob();
      if (!job) {
        break;
      }

      state.totalClaims += 1;
      void executeJob(job.id);
    }
  } catch (error) {
    state.lastExecutionError =
      error instanceof Error ? error.message : String(error);
  } finally {
    state.pumpInProgress = false;
    if (state.pumpPending) {
      state.pumpPending = false;
      queueMicrotask(() => {
        void pumpQueue();
      });
    }
  }
}

async function executeNext(): Promise<void> {
  try {
    const claimed = await claimNextJob();
    if (!claimed) {
      state.lastExecutionAt = new Date().toISOString();
      state.lastExecutionError = null;
      return;
    }

    state.totalClaims += 1;
    await executeJob(claimed.id);
  } catch (error) {
    state.lastExecutionError =
      error instanceof Error ? error.message : String(error);
  }
}

function startWorkerLoop(): void {
  if (state.workerTimer) {
    return;
  }

  state.workerTimer = setInterval(() => {
    void pumpQueue();
  }, POLL_INTERVAL_MS);

  void pumpQueue();
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cosmic-forge-worker",
    workerId: WORKER_ID,
    contractVersion: WORKER_CONTRACT_VERSION,
    forgeApiUrl: FORGE_API_URL,
    pollIntervalMs: POLL_INTERVAL_MS,
    maxConcurrency: MAX_CONCURRENCY,
    activeJobIds: state.currentActiveJobIds,
    activeExecutionCount: state.currentActiveJobIds.length,
    lastExecutionAt: state.lastExecutionAt,
    lastExecutionDurationMs: state.lastExecutionDurationMs,
    lastClaimAt: state.lastClaimAt,
    lastClaimedJobId: state.lastClaimedJobId,
    totalClaims: state.totalClaims,
    totalCompletions: state.totalCompletions,
    totalFailures: state.totalFailures,
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

export { app, bootstrap, executeNext, pumpQueue };

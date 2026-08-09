/*
  RuntimeLoadProfileService controls the live "stress load" worker processes that
  generate telemetry load for the system. It is intentionally decoupled from the
  Nest SSR server bootstrap to allow unit tests to instantiate it without pulling
  in heavy ESM dependencies such as Vite.
*/

import { existsSync, mkdirSync } from "fs";
import os from "os";
import { join } from "path";
import { ChildProcess, spawn, spawnSync } from "child_process";

export type LoadProfilePct = 10 | 25 | 50 | 100;

type RuntimeProfileSpec = {
  workers: number;
  ratePerWorker: number;
  payloadSize: number;
  note: string;
};

type DockerodeContainer = {
  id: string;
  start(): Promise<void>;
  wait(): Promise<{ StatusCode: number }>;
  remove(options?: { force?: boolean }): Promise<void>;
};

type DockerodeClient = {
  createContainer(
    options: Record<string, unknown>
  ): Promise<DockerodeContainer>;
};

type WorkerState = {
  id: number;
  cmd: string;
  args: string[];
  proc?: ChildProcess;
  containerId?: string;
  container?: DockerodeContainer;
  mode: "local" | "docker";
};

export function calibrateWorkers(
  pct: LoadProfilePct,
  maxWorkers: number
): number {
  if (pct === 10) {
    return 0;
  }
  const fraction = pct / 100;
  const desired = Math.max(1, Math.round(maxWorkers * fraction));
  return Math.min(desired, maxWorkers);
}

export const PROFILE_MAP: Record<LoadProfilePct, RuntimeProfileSpec> = {
  10: {
    workers: 0,
    ratePerWorker: 0,
    payloadSize: 512,
    note: "baseline (no extra runtime workers)",
  },
  25: {
    workers: 2,
    ratePerWorker: 500_000,
    payloadSize: 1024,
    note: "low stress",
  },
  50: {
    workers: 4,
    ratePerWorker: 1_500_000,
    payloadSize: 1024,
    note: "medium stress",
  },
  100: {
    workers: 8,
    ratePerWorker: 3_000_000,
    payloadSize: 2048,
    note: "smoke stress (bounded)",
  },
};

export function getRuntimeLoadWorkerBytes(): number {
  try {
    const fs = require("fs");
    const path = require("path");
    const logsDir = path.join(process.cwd(), "tools", "data-generator", "logs");
    const names = fs.readdirSync(logsDir);
    const workerFiles = names.filter((n: string) =>
      /^runtime-profile\.worker-\d+\.bin$/.test(n)
    );
    return workerFiles.reduce((sum: number, filename: string) => {
      try {
        const st = fs.statSync(path.join(logsDir, filename));
        return sum + st.size;
      } catch {
        return sum;
      }
    }, 0);
  } catch {
    return 0;
  }
}

export class RuntimeLoadProfileService {
  private profile: LoadProfilePct = 10;
  private workers: WorkerState[] = [];
  private maxDurationTimer: NodeJS.Timeout | null = null;
  private readonly defaultSmokeSeconds = 180;

  private readonly useDockerWorkers =
    process.env["STRESS_USE_DOCKER_WORKERS"] === "true";
  private readonly disableStress = process.env["STRESS_DISABLE"] === "true"; // global kill switch
  private readonly dockerImage =
    process.env["STRESS_DOCKER_IMAGE"] || "phase2/data-generator:dev";
  private readonly dockerLogDir = join(
    process.cwd(),
    "tools",
    "data-generator",
    "logs"
  );
  private readonly maxWorkersRaw = Number(
    process.env["STRESS_MAX_WORKERS"] || "16"
  );
  private readonly cpuCount = Math.max(1, os.cpus().length);
  private readonly calibrateWorkers =
    process.env["STRESS_CALIBRATE_WORKERS"] !== "false";
  private readonly maxWorkers = Math.min(this.maxWorkersRaw, this.cpuCount);
  private readonly autoRevert = process.env["STRESS_AUTO_REVERT"] !== "false";
  private readonly maxDurationSeconds = Number(
    process.env["STRESS_MAX_DURATION"] || "300"
  );

  private readonly dockerClient: DockerodeClient | null;

  constructor() {
    if (this.useDockerWorkers) {
      try {
        // dockerode is optional; fall back to CLI if not available.
        // Avoid Vite dependency scanning by making the module name non-static.
        const dockerodeModule = "docker" + "ode";
        const Docker = require(dockerodeModule) as unknown as {
          new (): DockerodeClient;
        };
        this.dockerClient = new Docker();
      } catch (_e) {
        console.warn("dockerode not available; falling back to docker CLI");
        this.dockerClient = null;
      }
    } else {
      this.dockerClient = null;
    }
  }

  status() {
    const status: {
      profilePct: LoadProfilePct;
      workers: number;
      mode: "runtime-controlled" | "baseline";
      note: string;
    } = {
      profilePct: this.profile,
      workers: this.workers.length,
      mode: this.workers.length > 0 ? "runtime-controlled" : "baseline",
      note: PROFILE_MAP[this.profile].note,
    };
    // Provide a lightweight snapshot for debugging endpoints.
    this.runtimeLoadMetricsCallback?.(status);
    return status;
  }

  /**
   * Optional callback invoked on each status() call to keep external
   * telemetry/state in sync (e.g. the SSR telemetry SSE payload).
   */
  runtimeLoadMetricsCallback?: (status: {
    profilePct: LoadProfilePct;
    workers: number;
    mode: "runtime-controlled" | "baseline";
    note: string;
  }) => void;

  /**
   * Exposes a snapshot of currently active workers/containers for debugging.
   */
  getWorkerSnapshots() {
    return this.workers.map((w) => ({
      id: w.id,
      mode: w.mode,
      cmd: w.cmd,
      args: w.args,
      containerId: w.containerId,
      hasProc: !!w.proc,
      hasContainer: !!w.container,
    }));
  }

  async setProfile(
    pct: LoadProfilePct,
    smokeSeconds?: number
  ): Promise<Record<string, unknown>> {
    if (this.disableStress) {
      console.warn(
        "Stress load is disabled via STRESS_DISABLE=true; ignoring profile changes."
      );
      this.profile = 10;
      this.clearAutoRevertTimer();
      await this.stopWorkers();
      return this.status();
    }

    this.clearAutoRevertTimer();
    await this.stopWorkers();
    this.profile = pct;
    const spec = PROFILE_MAP[pct];

    if (spec.workers <= 0) {
      return this.status();
    }

    const effectiveWorkers = this.calibrateWorkers
      ? calibrateWorkers(pct, this.maxWorkers)
      : Math.min(spec.workers, this.maxWorkers);

    if (effectiveWorkers !== spec.workers) {
      console.warn(
        `Stress worker count adjusted from ${spec.workers} to ${effectiveWorkers} (max ${this.maxWorkers}, cpu ${this.cpuCount})`
      );
    }

    const started: WorkerState[] = [];
    try {
      for (let i = 0; i < effectiveWorkers; i++) {
        const w = await this.spawnWorker(i + 1, spec);
        started.push(w);
      }
      this.workers = started;
    } catch (e) {
      for (const w of started) {
        try {
          if (w.mode === "local" && w.proc) {
            w.proc.kill("SIGTERM");
          } else if (w.mode === "docker") {
            if (w.container?.remove) {
              void w.container.remove({ force: true }).catch(() => void 0);
            } else if (w.containerId) {
              spawn("docker", ["rm", "-f", w.containerId]);
            }
          }
        } catch {
          void 0;
        }
      }
      this.workers = [];
      this.profile = 10;
      throw e;
    }

    if (this.autoRevert && pct !== 10) {
      const durationSeconds = Math.max(
        1,
        Number(smokeSeconds ?? this.maxDurationSeconds)
      );
      this.maxDurationTimer = setTimeout(() => {
        void this.setProfile(10).catch((err) =>
          console.error("Auto-revert to 10% failed:", err)
        );
      }, durationSeconds * 1000);
    }

    return this.status();
  }

  async shutdown(): Promise<void> {
    this.clearAutoRevertTimer();
    await this.stopWorkers();
  }

  private clearAutoRevertTimer() {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  private resolveGeneratorExecutable(): string {
    const isWin = process.platform === "win32";
    const candidate = isWin
      ? join(process.cwd(), "tools", "data-generator", "data-generator.exe")
      : join(process.cwd(), "tools", "data-generator", "data-generator-linux");
    if (!existsSync(candidate)) {
      throw new Error(`data-generator executable not found at ${candidate}`);
    }
    return candidate;
  }

  private async spawnWorker(
    id: number,
    spec: RuntimeProfileSpec
  ): Promise<WorkerState> {
    if (this.useDockerWorkers) {
      return this.spawnDockerWorker(id, spec);
    }
    return this.spawnLocalWorker(id, spec);
  }

  private spawnLocalWorker(id: number, spec: RuntimeProfileSpec): WorkerState {
    const cmd = this.resolveGeneratorExecutable();
    const logDir = join(process.cwd(), "tools", "data-generator", "logs");
    try {
      mkdirSync(logDir, { recursive: true });
    } catch {
      void 0;
    }
    const sink = `file:${join(logDir, `runtime-profile.worker-${id}.bin`)}`;
    const args = [
      `--rate=${spec.ratePerWorker}`,
      `--payload-size=${spec.payloadSize}`,
      "--no-stdout",
      `--sink=${sink}`,
      "--audit-every=2000",
    ];

    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    proc.stderr?.on("data", (chunk) => {
      const msg = String(chunk || "").trim();
      if (msg) console.log(`[runtime-load worker-${id}] ${msg}`);
    });
    proc.on("exit", (code, signal) => {
      console.log(
        `[runtime-load worker-${id}] exited code=${code} signal=${signal}`
      );
      this.workers = this.workers.filter((w) => w.id !== id);
    });
    proc.on("error", (err) => {
      console.error(`[runtime-load worker-${id}] error`, err);
    });
    return { id, cmd, args, proc, mode: "local" };
  }

  private async spawnDockerWorker(
    id: number,
    spec: RuntimeProfileSpec
  ): Promise<WorkerState> {
    const logDir = this.dockerLogDir;
    try {
      mkdirSync(logDir, { recursive: true });
    } catch {
      void 0;
    }

    const containerName = `cosmic-stress-${this.profile}-${id}`;
    const sink = `file:/var/lib/data-generator/logs/runtime-profile.worker-${id}.bin`;
    const args = [
      `--rate=${spec.ratePerWorker}`,
      `--payload-size=${spec.payloadSize}`,
      "--no-stdout",
      `--sink=${sink}`,
      "--audit-every=2000",
    ];

    const worker: WorkerState = {
      id,
      cmd: "docker",
      args: [
        "run",
        "-d",
        "--rm",
        "--name",
        containerName,
        "-v",
        `${logDir}:/var/lib/data-generator/logs`,
        this.dockerImage,
        "/usr/local/bin/data-generator",
        ...args,
      ],
      mode: "docker",
    };

    // Prefer dockerode if available, otherwise fall back to docker CLI.
    if (this.dockerClient) {
      try {
        const container = await this.dockerClient.createContainer({
          Image: this.dockerImage,
          name: containerName,
          HostConfig: {
            Binds: [`${logDir}:/var/lib/data-generator/logs`],
            AutoRemove: true,
          },
          Cmd: ["/usr/local/bin/data-generator", ...args],
        });
        await container.start();

        worker.containerId = container.id;
        worker.container = container;

        container.wait().then(() => {
          console.log(
            `[runtime-load docker-${id}] container ${container.id} exited`
          );
          this.workers = this.workers.filter((w) => w.id !== id);
        });

        return worker;
      } catch (e) {
        console.warn(
          `[runtime-load docker-${id}] dockerode failed; falling back to docker CLI: ${e}`
        );
        // fall through to CLI fallback
      }
    }

    const procSync = spawnSync("docker", worker.args, { encoding: "utf8" });
    if (procSync.error) {
      throw procSync.error;
    }
    if (procSync.status !== 0) {
      console.error(
        `[runtime-load docker-${id}] docker run failed: ${procSync.stderr}`
      );
      throw new Error(
        `docker run failed: ${procSync.status} ${procSync.stderr}`
      );
    }

    worker.containerId = String(procSync.stdout || "").trim();

    const monitor = spawn("docker", ["wait", worker.containerId], {
      stdio: "ignore",
    });
    monitor.on("exit", (code, signal) => {
      console.log(
        `[runtime-load docker-${id}] container ${worker.containerId} exited code=${code} signal=${signal}`
      );
      this.workers = this.workers.filter((w) => w.id !== id);
    });

    return worker;
  }

  private async stopWorkers(): Promise<void> {
    const current = [...this.workers];
    this.workers = [];

    await Promise.all(
      current.map(
        (w) =>
          new Promise<void>((resolve) => {
            if (w.mode === "docker") {
              if (w.container?.remove) {
                void w.container.remove({ force: true }).catch(() => void 0);
                resolve();
                return;
              }
              if (!w.containerId) {
                resolve();
                return;
              }
              try {
                spawn("docker", ["rm", "-f", w.containerId]);
              } catch {
                void 0;
              }
              resolve();
              return;
            }

            if (!w.proc || w.proc.killed || w.proc.exitCode !== null) {
              resolve();
              return;
            }

            const done = () => resolve();
            w.proc.once("exit", done);
            try {
              w.proc.kill("SIGTERM");
            } catch {
              resolve();
            }
            setTimeout(() => {
              if (w.proc && w.proc.exitCode === null) {
                try {
                  w.proc.kill("SIGKILL");
                } catch {
                  void 0;
                }
              }
              resolve();
            }, 2000);
          })
      )
    );
  }
}

import { Injectable } from "@nestjs/common";
import { Request, Response } from "express";

type EmbeddedJobRecord = {
  jobId: string;
  workflow: string;
  datasetId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  requestedBy?: string;
  lineage?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  logs: string[];
  artifacts: Array<{
    name: string;
    url: string;
    mimeType?: string;
    size?: string;
  }>;
};

@Injectable()
export class EmbeddedMockBackendService {
  private readonly embeddedJobStore = new Map<string, EmbeddedJobRecord>();
  private readonly artifactContentStore = new Map<string, unknown>();
  private embeddedJobCounter = 0;
  private mockScanCount = 0;
  private mockDispatchCount = 0;
  private mockDispatchIntervalSeconds = 0.5;

  constructor() {
    this.seedJobs();
    setInterval(() => {
      this.mockScanCount += 1;
      for (const job of this.embeddedJobStore.values()) {
        const prev = job.status;
        this.advanceJobStatus(job);
        if (
          prev === "QUEUED" &&
          (job.status === "RUNNING" || job.status === "COMPLETED")
        ) {
          this.mockDispatchCount += 1;
        }
      }
    }, this.mockDispatchIntervalSeconds * 1000);
  }

  useEmbeddedE2eBackend(): boolean {
    const env = process.env["USE_EMBEDDED_E2E_BACKEND"];
    if (env === undefined || env === null) {
      return true;
    }
    return env === "true";
  }

  embeddedTopologyMetrics() {
    const jobs = Array.from(this.embeddedJobStore.values());
    const links = [
      { source: "prometheus" },
      { source: "admin" },
      { source: "derived" },
    ];
    return {
      profilePct: 25,
      workers: 2,
      note: "embedded-e2e-backend",
      counts: {
        queued: jobs.filter((job) => job.status === "QUEUED").length,
        running: jobs.filter((job) => job.status === "RUNNING").length,
        completed: jobs.filter((job) => job.status === "COMPLETED").length,
      },
      links,
    };
  }

  handleGovernance(req: Request, res: Response): boolean {
    if (!this.useEmbeddedE2eBackend()) {
      return false;
    }

    const path = req.path || req.originalUrl || "";
    const method = (req.method || "GET").toUpperCase();
    const sendJson = (statusCode: number, body: unknown) => {
      res.status(statusCode).json(body);
      return true;
    };

    if (method === "GET" && path === "/api/v1/public-sources") {
      return sendJson(200, [
        {
          name: "Embedded Sample Source",
          url: "https://example.invalid/embedded-source",
        },
      ]);
    }

    if (method === "GET" && path === "/api/v1/admin/dispatch") {
      return sendJson(200, {
        intervalSeconds: this.mockDispatchIntervalSeconds,
        scannedCount: this.mockScanCount,
        dispatchedCount: this.mockDispatchCount,
      });
    }

    if (method === "POST" && path === "/api/v1/admin/dispatch") {
      const newInterval = Number(
        (req.body as { intervalSeconds?: number })?.intervalSeconds ||
          this.mockDispatchIntervalSeconds
      );
      if (newInterval > 0) this.mockDispatchIntervalSeconds = newInterval;
      return sendJson(200, {
        intervalSeconds: this.mockDispatchIntervalSeconds,
        scannedCount: this.mockScanCount,
        dispatchedCount: this.mockDispatchCount,
      });
    }

    if (method === "POST" && path === "/api/v1/admin/release-deferred") {
      let released = 0;
      for (const job of this.embeddedJobStore.values()) {
        if (job.parameters?.["deferred"] === true) {
          job.parameters["deferred"] = false;
          job.status = "COMPLETED";
          job.updatedAt = new Date().toISOString();
          job.logs.push(`${job.updatedAt} status=COMPLETED`);
          released += 1;
        }
      }
      return sendJson(200, { released });
    }

    if (!this.interceptEmbeddedJobs()) {
      return false;
    }

    if (method === "GET" && path === "/api/v1/jobs/types") {
      return sendJson(200, [
        "import",
        "ingest",
        "export",
        "diagnostics",
        "cleanup",
      ]);
    }

    if (method === "POST" && path === "/api/v1/jobs/validate") {
      return sendJson(200, { valid: true });
    }

    if (method === "GET" && path === "/api/v1/jobs") {
      const jobs = Array.from(this.embeddedJobStore.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      return sendJson(200, jobs);
    }

    if (method === "POST" && path === "/api/v1/jobs") {
      const payload =
        req.body && typeof req.body === "object"
          ? (req.body as Record<string, unknown>)
          : {};
      const job = this.createEmbeddedJob(payload);
      this.embeddedJobStore.set(job.jobId, job);
      const statusCode = payload["requestedBy"] ? 202 : 201;
      return sendJson(statusCode, {
        jobId: job.jobId,
        status: job.status,
        queuedAt: job.createdAt,
      });
    }

    const pathMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)(?:\/(.+))?$/);
    if (!pathMatch) {
      return false;
    }

    const jobId = decodeURIComponent(pathMatch[1]);
    const suffix = pathMatch[2] || "";
    const job = this.embeddedJobStore.get(jobId);

    if (!job) {
      return sendJson(404, { error: "not_found", jobId });
    }

    if (method === "GET" && !suffix) {
      return sendJson(200, job);
    }

    if (method === "DELETE" && !suffix) {
      this.embeddedJobStore.delete(jobId);
      res.status(204).send();
      return true;
    }

    if (method === "POST" && suffix === "transition") {
      const body =
        req.body && typeof req.body === "object"
          ? (req.body as Record<string, unknown>)
          : {};
      const nextState = String(body["newState"] || body["state"] || "QUEUED");
      job.status = nextState;
      job.updatedAt = new Date().toISOString();
      job.logs.push(`${job.updatedAt} status=${nextState}`);
      return sendJson(200, job);
    }

    if (method === "GET" && suffix === "lineage") {
      return sendJson(200, job.lineage || {});
    }

    if (method === "PUT" && suffix === "lineage") {
      job.lineage =
        req.body && typeof req.body === "object"
          ? { ...(req.body as Record<string, unknown>) }
          : {};
      job.updatedAt = new Date().toISOString();
      return sendJson(200, job.lineage);
    }

    if (method === "GET" && suffix === "logs") {
      return sendJson(200, job.logs);
    }

    if (method === "GET" && suffix === "artifacts") {
      return sendJson(200, job.artifacts);
    }

    const artifactPath = `/api/v1/jobs/${jobId}/${suffix}`;
    const content = this.artifactContentStore.get(artifactPath);
    if (method === "GET" && content !== undefined) {
      return sendJson(200, content);
    }

    return false;
  }

  private interceptEmbeddedJobs(): boolean {
    return (
      this.useEmbeddedE2eBackend() &&
      process.env["EMBEDDED_E2E_JOBS"] !== "false"
    );
  }

  private createEmbeddedJobId(): string {
    this.embeddedJobCounter += 1;
    return `e2e-job-${Date.now()}-${this.embeddedJobCounter}`;
  }

  private createEmbeddedJob(
    payload: Record<string, unknown>
  ): EmbeddedJobRecord {
    const now = new Date().toISOString();
    const jobId = this.createEmbeddedJobId();
    const requestedBy =
      typeof payload["requestedBy"] === "string"
        ? (payload["requestedBy"] as string)
        : undefined;
    const parameters =
      payload["parameters"] && typeof payload["parameters"] === "object"
        ? ({ ...(payload["parameters"] as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};

    if (requestedBy === "ui-sample") {
      parameters["deferred"] = true;
    }

    return {
      jobId,
      workflow: String(payload["workflow"] || "import"),
      datasetId: payload["datasetId"]
        ? String(payload["datasetId"])
        : "embedded-dataset",
      status: "QUEUED",
      createdAt: now,
      updatedAt: now,
      requestedBy,
      lineage:
        payload["lineage"] && typeof payload["lineage"] === "object"
          ? { ...(payload["lineage"] as Record<string, unknown>) }
          : {},
      parameters,
      logs: [`${now} job created`, `${now} status=QUEUED`],
      artifacts: [],
    };
  }

  private seedJobs(): void {
    const now = Date.now();
    const seed = (
      workflow: string,
      status: string,
      datasetId: string,
      minsAgo: number
    ): EmbeddedJobRecord => {
      const createdAt = new Date(now - minsAgo * 60_000).toISOString();
      const job = this.createEmbeddedJob({
        workflow,
        datasetId,
        requestedBy: "dev-seed",
      });
      job.status = status;
      job.createdAt = createdAt;
      job.updatedAt = createdAt;
      job.logs = [`${createdAt} job created`, `${createdAt} status=${status}`];
      if (status === "COMPLETED") {
        this.registerVoArtifact(job);
      }
      return job;
    };

    for (const job of [
      seed("import", "COMPLETED", "ds-2026-alpha-001", 120),
      seed("vo.cone-search", "COMPLETED", "ds-2026-alpha-002", 90),
      seed("ingest", "RUNNING", "ds-2026-alpha-003", 45),
      seed("export", "QUEUED", "ds-2026-alpha-004", 10),
      seed("diagnostics", "COMPLETED", "ds-2026-alpha-005", 60),
    ]) {
      this.embeddedJobStore.set(job.jobId, job);
    }
  }

  private advanceJobStatus(job: EmbeddedJobRecord): EmbeddedJobRecord {
    if (job.status !== "QUEUED" && job.status !== "RUNNING") return job;
    const ageMs = Date.now() - new Date(job.updatedAt).getTime();
    const now = new Date().toISOString();

    const isLongJob = () => {
      if (job.workflow.startsWith("vo.")) return true;
      const hint = job.parameters?.["runtime"];
      return typeof hint === "string" && hint.toLowerCase() === "long";
    };

    const queuedToRunningMs = 100;
    const shortRunMs = 500;
    const longRunMs = 3_000;

    if (job.status === "QUEUED" && ageMs > queuedToRunningMs) {
      job.status = "RUNNING";
      job.updatedAt = now;
      job.logs.push(`${now} status=RUNNING`);
      return job;
    }

    if (
      job.status === "RUNNING" &&
      ageMs > (isLongJob() ? longRunMs : shortRunMs)
    ) {
      job.status = "COMPLETED";
      job.updatedAt = now;
      job.logs.push(`${now} status=COMPLETED`);
      this.registerVoArtifact(job);
    }

    return job;
  }

  private registerVoArtifact(job: EmbeddedJobRecord): void {
    if (job.artifacts.length > 0) return;
    const params = (job.parameters ?? {}) as Record<string, unknown>;
    const payload = this.voExternalSourcePayload(
      job.workflow,
      params,
      job.jobId
    );
    if (!payload) return;
    const artifactName = "external-call.json";
    const artifactUrl = `/api/v1/jobs/${job.jobId}/artifacts/${artifactName}`;
    job.artifacts = [
      { name: artifactName, url: artifactUrl, mimeType: "application/json" },
    ];
    this.artifactContentStore.set(artifactUrl, payload);
  }

  private voExternalSourcePayload(
    workflow: string,
    params: Record<string, unknown>,
    _jobId: string
  ): Record<string, unknown> | null {
    switch (workflow) {
      case "vo.cone-search":
      case "vo.scs":
        return {
          type: "external-source",
          provider: String(params["provider"] ?? "HEASARC"),
          sourceName: `Cone Search – ${params["target"] ?? "3C 273"} (r=${
            params["radius"] ?? 0.1
          }°)`,
          accessUrl: String(
            params["serviceUrl"] ??
              "https://heasarc.gsfc.nasa.gov/xamin/vo/cone"
          ),
          sampleFields: [
            "source_name",
            "ra",
            "dec",
            "flux_erg_s_cm2",
            "mission",
          ],
          sampleRows: [
            ["3C273", "187.2779", "2.0524", "1.62e-11", "Chandra/CXO"],
            ["3C273_off1", "187.2960", "2.0714", "4.10e-14", "ROSAT/HRI"],
            ["3C273_off2", "187.2610", "2.0341", "2.80e-14", "XMM-Newton"],
          ],
          links: [
            {
              accessUrl: `https://heasarc.gsfc.nasa.gov/xamin/vo/cone?target=${
                params["target"] ?? "3C273"
              }&radius=${params["radius"] ?? 0.1}&format=votable`,
              semantics: "#this",
              contentType: "application/x-votable+xml",
            },
          ],
        };
      case "vo.adql.query":
        return {
          type: "external-source",
          provider: String(params["provider"] ?? "NRAO"),
          sourceName: `ADQL Query – ${String(
            params["tapUrl"] ?? "unknown TAP"
          ).replace("https://", "")}`,
          tapUrl: String(
            params["tapUrl"] ?? "https://data-query.nrao.edu/tap/sync"
          ),
          sampleFields: [
            "obs_id",
            "ra",
            "dec",
            "t_exptime",
            "dataproduct_type",
          ],
          sampleRows: [
            ["VLASS1.1+J123049+122322", "187.706", "12.390", "5.0", "image"],
            ["VLASS1.1+J123051+122344", "187.713", "12.395", "5.0", "image"],
            ["VLASS1.1+J123052+122316", "187.718", "12.388", "10.0", "image"],
          ],
          links: [],
        };
      case "vo.obscore.search":
        return {
          type: "external-source",
          provider: String(params["provider"] ?? "NRAO"),
          sourceName: `ObsCore Search – M87 cubes (r=${
            (params["position"] as Record<string, unknown>)?.["radius"] ?? 0.2
          }°)`,
          tapUrl: String(
            params["tapUrl"] ?? "https://data-query.nrao.edu/tap/sync"
          ),
          sampleFields: [
            "obs_id",
            "obs_title",
            "s_ra",
            "s_dec",
            "dataproduct_type",
          ],
          sampleRows: [
            [
              "ALMA-M87-2017.1.00843",
              "M87 ALMA Band 6",
              "187.706",
              "12.391",
              "cube",
            ],
            [
              "EVLA-M87-13A-292",
              "M87 JVLA L-band",
              "187.705",
              "12.390",
              "cube",
            ],
          ],
          links: [],
        };
      case "vo.datalink.resolve":
        return {
          type: "external-source",
          provider: String(params["provider"] ?? "NRAO"),
          sourceName: `DataLink – ${
            params["datasetIdentifier"] ?? "unknown dataset"
          }`,
          accessUrl: String(
            params["datalinkUrl"] ?? "https://data-query.nrao.edu/datalink"
          ),
          sampleFields: [
            "ID",
            "access_url",
            "semantics",
            "content_type",
            "content_length",
          ],
          sampleRows: [
            [
              String(params["datasetIdentifier"] ?? ""),
              "https://data-query.nrao.edu/products/ngvla-pilot-ms-0001.ms.tar",
              "#this",
              "application/tar",
              "3221225472",
            ],
            [
              String(params["datasetIdentifier"] ?? ""),
              "https://data-query.nrao.edu/products/ngvla-pilot-ms-0001.fits",
              "#preview",
              "application/fits",
              "104857600",
            ],
          ],
          links: [],
        };
      case "vo.product.fetch":
        return {
          type: "external-source",
          provider: String(params["provider"] ?? "NRAO"),
          sourceName: `Product Download – ${
            String(params["productUrl"] ?? "")
              .split("/")
              .pop() ?? "unknown"
          }`,
          accessUrl: String(params["productUrl"] ?? ""),
          sampleFields: ["keyword", "value", "comment"],
          sampleRows: [
            ["SIMPLE", "T", "file conforms to FITS standard"],
            ["BITPIX", "-32", "4-byte IEEE floating-point values"],
            ["NAXIS", "4", "number of data axes"],
            ["NAXIS1", "1024", "RA axis length"],
            ["TELESCOP", "ngVLA", "Next Generation Very Large Array"],
          ],
          links: [],
        };
      default:
        return null;
    }
  }
}

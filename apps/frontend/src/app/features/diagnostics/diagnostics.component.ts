import { AfterViewInit, Component, OnDestroy, inject } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { DataSourceService } from "../../services/data-source.service";
import { MockDataService } from "../../services/mock-data.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { RequestCacheService } from "../../services/request-cache.service";
import { Subscription } from "rxjs";
import { switchMap } from "rxjs/operators";
import { interval } from "rxjs";
import {
  CommissioningScenario,
  DiagnosticsIndex,
  DockerServiceStatus,
  PulsarStatus,
  RabbitMQStatus,
} from "../../shared/types";

/** Live event interface for diagnostics */
export interface JobEvent {
  type: string;
  payload: {
    ts?: number;
    jobId?: string;
    message?: string;
    fileName?: string;
    [key: string]: unknown;
  };
}

@Component({
  selector: "app-diagnostics",
  templateUrl: "./diagnostics.component.html",
  styleUrls: ["./diagnostics.component.scss"],
  standalone: false,
})
export class DiagnosticsComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private dataSource = inject(DataSourceService);
  private mock = inject(MockDataService);
  private loadProfile = inject(LoadProfileService);
  private cache = inject(RequestCacheService);

  private eventStream?: EventSource;
  /** Formats a live event for pretty display */
  formatEvent(event: JobEvent): string {
    if (!event || typeof event !== "object") return "";
    switch (event.type) {
      case "heartbeat":
        return `Heartbeat at ${
          event.payload?.ts
            ? new Date(event.payload.ts).toLocaleString()
            : "unknown time"
        }`;
      case "job_started":
        return `Job started: ${event.payload?.jobId || "unknown"}`;
      case "job_completed":
        return `Job completed: ${event.payload?.jobId || "unknown"}`;
      case "error":
        return `Error: ${event.payload?.message || "unknown error"}`;
      case "file_received":
        return `File received: ${event.payload?.fileName || "unknown file"}`;
      default:
        return `${event.type}: ${
          event.payload ? JSON.stringify(event.payload) : ""
        }`;
    }
  }
  /** Returns a badge class for a file based on its type */
  getFileBadgeClass(file: string): string {
    const type = this.getFileType(file);
    switch (type) {
      case "FITS":
        return "badge-file-fits";
      case "CSV":
        return "badge-file-csv";
      case "JSON":
        return "badge-file-json";
      case "Archive":
        return "badge-file-archive";
      case "Preview":
        return "badge-file-preview";
      default:
        return "badge-file-other";
    }
  }

  /** Returns a display type for a file */
  getFileType(file: string): string {
    const n = file.toLowerCase();
    if (/\.fit(s|sz?)?$|\.fz$/.test(n)) return "FITS";
    if (/\.csv$/.test(n)) return "CSV";
    if (/\.json$/.test(n)) return "JSON";
    if (/\.(tar\.gz|tar|zip|gz)$|\.ms\.tar/.test(n)) return "Archive";
    if (/\.(png|jpg|jpeg|svg|webp)$/.test(n)) return "Preview";
    return "Other";
  }
  index: DiagnosticsIndex | null = null;
  /** Live events received from the broker */
  readonly jobEvents$ = new BehaviorSubject<JobEvent[]>([]);

  // reactive state subjects to avoid ExpressionChangedAfterItHasBeenChecked
  readonly loading$ = new BehaviorSubject<boolean>(false);
  get loading(): boolean {
    return this.loading$.value;
  }

  error: string | null = null;

  systemSpecs: string | null = null;
  dockerServices: DockerServiceStatus[] = [];
  visibleFileCount = 5;
  readonly fileCountOptions: number[] = [5, 10, 25, 50, 100, -1];
  sortedFiles: string[] = [];
  lastUpdated: Date | null = null;
  pulsarStatus: PulsarStatus = { brokers: 0, topics: 0, partitions: 0 };
  rabbitMQStatus: RabbitMQStatus = { status: "unknown", connection: "unknown" };
  // mission closure metrics
  timingDriftNs?: number;
  rfiEventRate?: number;

  readonly initialLoadSettled$ = new BehaviorSubject<boolean>(false);
  get initialLoadSettled(): boolean {
    return this.initialLoadSettled$.value;
  }

  // VO services
  // external-source preview removed from diagnostics; see Datasets / Viewer instead
  commissioningScenarios: CommissioningScenario[] = [];
  readonly commissioningLoading$ = new BehaviorSubject<boolean>(false);
  get commissioningLoading(): boolean {
    return this.commissioningLoading$.value;
  }
  commissioningError: string | null = null;
  private pollSubscription?: Subscription;
  private brokerPollSubscription?: Subscription;

  private deferUiUpdate(task: () => void): void {
    setTimeout(task, 0);
  }

  ngAfterViewInit(): void {
    this.deferUiUpdate(() => {
      this.fetchIndex();
      this.fetchDockerServices();
      this.fetchPulsarStatus();
      this.fetchRabbitMQStatus();
      this.fetchTimingMetrics();
      this.fetchCommissioningScenarios();
      this.startPolling();
      this.startBrokerPolling();
      this.connectEventStream();
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.brokerPollSubscription?.unsubscribe();
    if (this.eventStream) {
      this.eventStream.close();
      this.eventStream = undefined;
    }
  }

  /** Connects to the backend event stream and updates jobEvents */
  connectEventStream(): void {
    if (this.eventStream) return;
    // only run in environments where EventSource exists (browser)
    if (typeof EventSource === "undefined") {
      // during unit tests or non-browser contexts we skip streaming
      return;
    }
    // the mock server exposes an SSE endpoint under /api/v1/broker-events
    // keep diagnostics/events for potential future dedicated endpoint
    const url = "/api/v1/broker-events"; // fallback: "/api/diagnostics/events";
    this.eventStream = new EventSource(url);
    this.eventStream.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Add new event to the front, keep max 10
        this.deferUiUpdate(() => {
          const next = [data, ...this.jobEvents$.value].slice(0, 10);
          this.jobEvents$.next(next);
        });
      } catch (_e) {
        // ignore malformed events
      }
    };
    this.eventStream.onerror = () => {
      // Optionally handle errors or reconnect
    };
  }

  startPolling(): void {
    if (this.pollSubscription) return;
    this.pollSubscription = this.loadProfile.pollingMs$
      .pipe(switchMap((ms) => interval(ms)))
      .subscribe(() => this.fetchDockerServices(true));
  }

  startBrokerPolling(): void {
    if (this.brokerPollSubscription) return;
    this.brokerPollSubscription = interval(500).subscribe(() => {
      this.fetchPulsarStatus();
      this.fetchRabbitMQStatus();
    });
  }

  stopPolling(): void {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = undefined;
  }

  private fetchTimingMetrics() {
    if (this.dataSource.mode === "mock") {
      this.timingDriftNs = 0;
      this.rfiEventRate = 0;
      return;
    }
    this.http
      .get<{ timing_drift_ns?: number; rfi_event_rate?: number }>(
        "/api/metrics/topology"
      )
      .subscribe(
        (res) => {
          this.deferUiUpdate(() => {
            this.timingDriftNs = res.timing_drift_ns;
            this.rfiEventRate = res.rfi_event_rate;
          });
        },
        () => {
          // ignore errors; diagnostics already shows other failures
        }
      );
  }

  private fetchVoServices() {
    // intentionally left blank - diagnostics no longer queries VO services
  }
  // intentionally left blank - diagnostics no longer fetches VO summaries

  fetchCommissioningScenarios(): void {
    this.deferUiUpdate(() => {
      this.commissioningLoading$.next(true);
      this.commissioningError = null;
    });
    if (this.dataSource.mode === "mock") {
      this.deferUiUpdate(() => {
        this.commissioningScenarios = [
          {
            id: "antenna_calibration",
            name: "Antenna Calibration",
            type: "aiv",
            description: "Mock: validates antenna calibration parameters.",
            requiredParameters: [
              "antennaId",
              "targetFrequencyMHz",
              "pointingModelVersion",
            ],
          },
          {
            id: "timing_sync",
            name: "Timing Synchronisation",
            type: "aiv",
            description: "Mock: validates timing reference synchronisation.",
            requiredParameters: [
              "referenceElementId",
              "maxDriftNs",
              "syncProtocol",
            ],
          },
          {
            id: "rfi_baseline",
            name: "RFI Baseline Survey",
            type: "aiv",
            description: "Mock: validates RFI environment baseline.",
            requiredParameters: [
              "siteId",
              "frequencyRangeMHz",
              "maxOccupancyPercent",
            ],
          },
        ];
      });
      this.commissioningLoading$.next(false);
      return;
    }
    this.http
      .get<CommissioningScenario[]>("/api/v1/commissioning/scenarios")
      .subscribe(
        (res) => {
          this.deferUiUpdate(() => {
            this.commissioningScenarios = res;
            this.commissioningLoading$.next(false);
          });
        },
        (err) => {
          this.deferUiUpdate(() => {
            this.commissioningError = String(err?.message || err);
            this.commissioningLoading$.next(false);
          });
        }
      );
  }

  fetchIndex() {
    this.deferUiUpdate(() => {
      this.loading$.next(true);
      this.error = null;
    });
    if (this.dataSource.mode === "mock") {
      this.mock.diagnosticsIndex().subscribe((res) => {
        this.deferUiUpdate(() => {
          this.index = res as DiagnosticsIndex;
          this.sortedFiles = this.sortFilesByRecency(this.index?.files || []);
          this.loading$.next(false);
          this.initialLoadSettled$.next(true);
        });
      });
      return;
    }
    this.cache
      .getOrCreate("diagnostics:index", 5000, () =>
        this.http.get<DiagnosticsIndex>("/api/diagnostics")
      )
      .subscribe(
        (res) => {
          this.deferUiUpdate(() => {
            this.index = res;
            this.sortedFiles = this.sortFilesByRecency(res.files);
            this.loading$.next(false);
            this.initialLoadSettled$.next(true);
          });
        },
        (err) => {
          this.deferUiUpdate(() => {
            this.error = String(err?.message || err);
            this.loading$.next(false);
            this.initialLoadSettled$.next(true);
          });
        }
      );
  }

  viewSystemSpecs() {
    this.deferUiUpdate(() => {
      this.loading$.next(true);
      this.systemSpecs = null;
    });
    if (this.dataSource.mode === "mock") {
      this.mock.systemSpecsText().subscribe((txt) => {
        this.deferUiUpdate(() => {
          this.systemSpecs = txt;
          this.loading$.next(false);
        });
      });
      return;
    }
    this.http
      .get("/api/diagnostics/system-specs", { responseType: "text" })
      .subscribe(
        (txt) => {
          this.deferUiUpdate(() => {
            this.systemSpecs = txt;
            this.loading$.next(false);
          });
        },
        (err) => {
          this.deferUiUpdate(() => {
            this.error = String(err?.message || err);
            this.loading$.next(false);
          });
        }
      );
  }

  fetchDockerServices(silent = false) {
    if (!silent) {
      this.loading$.next(true);
      this.error = null;
    }
    if (this.dataSource.mode === "mock") {
      this.mock.mockDockerServices().subscribe((res) => {
        this.deferUiUpdate(() => {
          this.dockerServices = (res as DockerServiceStatus[]).filter(
            (s) => s.name !== "Pulsar" && s.name !== "RabbitMQ"
          );
          this.lastUpdated = new Date();
          if (!silent) this.loading$.next(false);
        });
      });
      return;
    }
    this.cache
      .getOrCreate("diagnostics:docker-services", 4000, () =>
        this.http.get<DockerServiceStatus[]>("/api/diagnostics/docker-services")
      )
      .subscribe(
        (res) => {
          this.deferUiUpdate(() => {
            this.dockerServices = res.filter(
              (s) => s.name !== "Pulsar" && s.name !== "RabbitMQ"
            );
            this.lastUpdated = new Date();
            if (!silent) this.loading$.next(false);
          });
        },
        (err) => {
          if (!silent) {
            this.deferUiUpdate(() => {
              this.error = String(err?.message || err);
              this.loading$.next(false);
            });
          }
        }
      );
  }

  fetchPulsarStatus(): void {
    this.cache
      .getOrCreate("diagnostics:pulsar-status", 5000, () =>
        this.http.get<PulsarStatus>("/api/v1/pulsar/status")
      )
      .subscribe({
        next: (status: PulsarStatus) => {
          this.deferUiUpdate(() => {
            this.pulsarStatus = {
              brokers: status.brokers || 0,
              topics: status.topics || 0,
              partitions: status.partitions || 0,
              status: status.status,
            };
          });
        },
        error: (err) => {
          this.deferUiUpdate(() => {
            this.pulsarStatus = {
              brokers: 0,
              topics: 0,
              partitions: 0,
              status: "offline",
            };
          });

          console.log("Failed to fetch Pulsar status:", err);
        },
      });
  }

  fetchRabbitMQStatus(): void {
    this.cache
      .getOrCreate("diagnostics:rabbit-status", 5000, () =>
        this.http.get<RabbitMQStatus>("/api/v1/rabbitmq/status")
      )
      .subscribe({
        next: (status: RabbitMQStatus) => {
          this.deferUiUpdate(() => {
            this.rabbitMQStatus = status;
          });
        },
        error: (err) => {
          this.deferUiUpdate(() => {
            this.rabbitMQStatus = {
              status: "unavailable",
              connection: "error",
              error: err.message,
            };
          });
        },
      });
  }

  get visibleFiles(): string[] {
    if (this.visibleFileCount < 0) return this.sortedFiles;
    return this.sortedFiles.slice(0, this.visibleFileCount);
  }

  setVisibleFileCount(count: number): void {
    this.visibleFileCount = Number(count);
  }

  private sortFilesByRecency(files: string[]): string[] {
    const filtered = (files || []).filter((f) => f !== ".gitkeep");
    return filtered.slice().sort((a, b) => {
      const at = this.extractTimestamp(a);
      const bt = this.extractTimestamp(b);
      if (bt !== at) return bt - at;
      return b.localeCompare(a);
    });
  }

  private extractTimestamp(fileName: string): number {
    const m = fileName.match(/\.(\d{8}T\d{6}Z)$/);
    if (!m?.[1]) return 0;
    const raw = m[1];
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(
      6,
      8
    )}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

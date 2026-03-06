import { Component, OnInit, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { DataSourceService } from "../../services/data-source.service";
import { MockDataService } from "../../services/mock-data.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { Subscription } from "rxjs";
import { switchMap } from "rxjs/operators";
import { interval } from "rxjs";
import {
  DiagnosticsIndex,
  DockerServiceStatus,
  PulsarStatus,
  RabbitMQStatus,
} from "../../shared/types";

@Component({
  selector: "app-diagnostics",
  templateUrl: "./diagnostics.component.html",
  styleUrls: ["./diagnostics.component.scss"],
})
export class DiagnosticsComponent implements OnInit, OnDestroy {
  index: DiagnosticsIndex | null = null;
  loading = false;
  error: string | null = null;
  systemSpecs: string | null = null;
  dockerServices: DockerServiceStatus[] = [];
  visibleFileCount = 5;
  readonly fileCountOptions: number[] = [5, 10, 25, 50, 100, -1];
  sortedFiles: string[] = [];
  autoRefresh = true;
  lastUpdated: Date | null = null;
  currentPollingMs = 5000;
  pulsarStatus: PulsarStatus = { brokers: 0, topics: 0, partitions: 0 };
  rabbitMQStatus: RabbitMQStatus = { status: "unknown", connection: "unknown" };
  // mission closure metrics
  timingDriftNs?: number;
  rfiEventRate?: number;
  // VO services
  voTapUrl?: string | null = null;
  voDataLinkUrl?: string | null = null;
  private pollSubscription?: Subscription;
  private pollingMsSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private dataSource: DataSourceService,
    private mock: MockDataService,
    private loadProfile: LoadProfileService
  ) {}

  ngOnInit(): void {
    this.fetchIndex();
    this.fetchDockerServices();
    this.fetchPulsarStatus();
    this.fetchRabbitMQStatus();
    this.fetchTimingMetrics();
    this.fetchVoServices();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.pollingMsSubscription?.unsubscribe();
  }

  startPolling(): void {
    if (this.pollSubscription) return;
    // Subscribe to pollingMs$ and restart interval when it changes
    this.pollSubscription = this.loadProfile.pollingMs$
      .pipe(
        switchMap((ms) => {
          this.currentPollingMs = ms;
          return interval(ms);
        })
      )
      .subscribe(() => {
        if (this.autoRefresh) {
          this.fetchDockerServices(true); // silent refresh
          this.fetchPulsarStatus();
          this.fetchRabbitMQStatus();
        }
      });
  }

  stopPolling(): void {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = undefined;
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
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
          this.timingDriftNs = res.timing_drift_ns;
          this.rfiEventRate = res.rfi_event_rate;
        },
        () => {
          // ignore errors; diagnostics already shows other failures
        }
      );
  }

  private fetchVoServices() {
    if (this.dataSource.mode === "mock") {
      this.voTapUrl = null;
      this.voDataLinkUrl = null;
      return;
    }
    this.http
      .get<{ tapUrl?: string; dataLinkUrl?: string }>("/api/v1/vo/services")
      .subscribe(
        (res) => {
          this.voTapUrl = res.tapUrl ?? null;
          this.voDataLinkUrl = res.dataLinkUrl ?? null;
        },
        () => {
          // non-critical; ignore failures
        }
      );
  }

  fetchIndex() {
    this.loading = true;
    this.error = null;
    if (this.dataSource.mode === "mock") {
      this.mock.diagnosticsIndex().subscribe((res) => {
        this.index = res as DiagnosticsIndex;
        this.sortedFiles = this.sortFilesByRecency(this.index?.files || []);
        this.loading = false;
      });
      return;
    }
    this.http.get<DiagnosticsIndex>("/api/diagnostics").subscribe(
      (res) => {
        this.index = res;
        this.sortedFiles = this.sortFilesByRecency(res.files);
        this.loading = false;
      },
      (err) => {
        this.error = String(err?.message || err);
        this.loading = false;
      }
    );
  }

  viewSystemSpecs() {
    this.loading = true;
    this.systemSpecs = null;
    if (this.dataSource.mode === "mock") {
      this.mock.systemSpecsText().subscribe((txt) => {
        this.systemSpecs = txt;
        this.loading = false;
      });
      return;
    }
    this.http
      .get("/api/diagnostics/system-specs", { responseType: "text" })
      .subscribe(
        (txt) => {
          this.systemSpecs = txt;
          this.loading = false;
        },
        (err) => {
          this.error = String(err?.message || err);
          this.loading = false;
        }
      );
  }

  fetchDockerServices(silent = false) {
    if (!silent) {
      this.loading = true;
      this.error = null;
    }
    if (this.dataSource.mode === "mock") {
      this.mock.mockDockerServices().subscribe((res) => {
        this.dockerServices = res as DockerServiceStatus[];
        this.lastUpdated = new Date();
        if (!silent) this.loading = false;
      });
      return;
    }
    this.http
      .get<DockerServiceStatus[]>("/api/diagnostics/docker-services")
      .subscribe(
        (res) => {
          this.dockerServices = res;
          this.lastUpdated = new Date();
          if (!silent) this.loading = false;
        },
        (err) => {
          if (!silent) {
            this.error = String(err?.message || err);
            this.loading = false;
          }
        }
      );
  }

  fetchPulsarStatus(): void {
    this.http.get<PulsarStatus>("/api/v1/pulsar/status").subscribe({
      next: (status: PulsarStatus) => {
        this.pulsarStatus = {
          brokers: status.brokers || 0,
          topics: status.topics || 0,
          partitions: status.partitions || 0,
        };
      },
      error: (err) => {
        // Keep previous status or set to 0 on error
        this.pulsarStatus = { brokers: 0, topics: 0, partitions: 0 };

        console.log("Failed to fetch Pulsar status:", err);
      },
    });
  }

  fetchRabbitMQStatus(): void {
    this.http.get<RabbitMQStatus>("/api/v1/rabbitmq/status").subscribe({
      next: (status: RabbitMQStatus) => {
        this.rabbitMQStatus = status;
      },
      error: (err) => {
        this.rabbitMQStatus = {
          status: "unavailable",
          connection: "error",
          error: err.message,
        };
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

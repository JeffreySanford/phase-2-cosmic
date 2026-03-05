import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DataSourceService } from '../../services/data-source.service';
import { MockDataService } from '../../services/mock-data.service';
import { LoadProfileService } from '../../services/load-profile.service';
import { Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { interval } from 'rxjs';

interface DiagnosticsIndex {
  path: string;
  files: string[];
}

interface DockerServiceStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  details?: string;
  error?: string;
  latencyMs?: number;
  icon?: string;
}

@Component({
  selector: 'app-diagnostics',
  templateUrl: './diagnostics.component.html',
  styleUrls: ['./diagnostics.component.scss'],
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
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.pollingMsSubscription?.unsubscribe();
  }

  startPolling(): void {
    if (this.pollSubscription) return;
    // Subscribe to pollingMs$ and restart interval when it changes
    this.pollSubscription = this.loadProfile.pollingMs$.pipe(
      switchMap((ms) => {
        this.currentPollingMs = ms;
        return interval(ms);
      })
    ).subscribe(() => {
      if (this.autoRefresh) {
        this.fetchDockerServices(true); // silent refresh
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

  fetchIndex() {
    this.loading = true;
    this.error = null;
    if (this.dataSource.mode === 'mock') {
      this.mock.diagnosticsIndex().subscribe((res) => {
        this.index = res as DiagnosticsIndex;
        this.sortedFiles = this.sortFilesByRecency(this.index?.files || []);
        this.loading = false;
      });
      return;
    }
    this.http.get<DiagnosticsIndex>('/api/diagnostics').subscribe(
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
    if (this.dataSource.mode === 'mock') {
      this.mock.systemSpecsText().subscribe((txt) => {
        this.systemSpecs = txt;
        this.loading = false;
      });
      return;
    }
    this.http.get('/api/diagnostics/system-specs', { responseType: 'text' }).subscribe(
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
    if (this.dataSource.mode === 'mock') {
      this.mock.mockDockerServices().subscribe((res) => {
        this.dockerServices = res as DockerServiceStatus[];
        this.lastUpdated = new Date();
        if (!silent) this.loading = false;
      });
      return;
    }
    this.http.get<DockerServiceStatus[]>('/api/diagnostics/docker-services').subscribe(
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

  get visibleFiles(): string[] {
    if (this.visibleFileCount < 0) return this.sortedFiles;
    return this.sortedFiles.slice(0, this.visibleFileCount);
  }

  setVisibleFileCount(count: number): void {
    this.visibleFileCount = Number(count);
  }

  private sortFilesByRecency(files: string[]): string[] {
    const filtered = (files || []).filter((f) => f !== '.gitkeep');
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
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SidebarService } from '../../base/sidebar/sidebar.service';
import { DatasetsService, Dataset } from '../../services/datasets.service';
import { JobsService, JobStatus } from '../../services/jobs.service';
import { TelemetryService } from '../../services/telemetry.service';
import { DataSourceService } from '../../services/data-source.service';
import { MockDataService } from '../../services/mock-data.service';

interface StatCard {
  label: string;
  value: string;
  note: string;
  tone: 'cyan' | 'amber' | 'mint' | 'violet';
}

interface QuickCheck {
  label: string;
  status: 'healthy' | 'degraded';
  detail: string;
  route: string;
}

interface SignalBar {
  label: string;
  value: number;
  tone: 'cyan' | 'amber' | 'mint' | 'violet';
}

interface DiagnosticsIndex {
  path: string;
  files: string[];
}

interface ProbeResult<T> {
  ok: boolean;
  value: T;
}

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent implements OnInit, OnDestroy {
  collapsed = false;
  loadingSnapshot = false;
  lastUpdated: Date | null = null;

  statCards: StatCard[] = [
    { label: 'Governed Datasets', value: '0', note: 'Awaiting sync', tone: 'cyan' },
    { label: 'Active Jobs', value: '0', note: 'Pipeline idle', tone: 'amber' },
    { label: 'Diagnostics Artifacts', value: '0', note: 'No recent captures', tone: 'mint' },
    { label: 'Prometheus Targets Up', value: '0', note: 'Telemetry unavailable', tone: 'violet' },
  ];

  quickChecks: QuickCheck[] = [
    { label: 'Jobs API', status: 'degraded', detail: 'Waiting for first probe', route: '/jobs' },
    { label: 'Dataset API', status: 'degraded', detail: 'Waiting for first probe', route: '/datasets' },
    { label: 'Diagnostics API', status: 'degraded', detail: 'Waiting for first probe', route: '/diagnostics' },
    { label: 'Telemetry Proxy', status: 'degraded', detail: 'Waiting for first probe', route: '/telemetry' },
  ];

  signalBars: SignalBar[] = [
    { label: 'Operational Visibility', value: 24, tone: 'cyan' },
    { label: 'Governance Coverage', value: 18, tone: 'mint' },
    { label: 'Orchestration Readiness', value: 12, tone: 'amber' },
    { label: 'System Observability', value: 20, tone: 'violet' },
  ];

  readonly capabilityHighlights = [
    {
      title: 'Live Operations Pulse',
      detail: 'Dashboard + Telemetry stream current mission health and load trends with sub-minute cadence.',
      route: '/dashboard',
      cta: 'Open Dashboard',
    },
    {
      title: 'Trusted Governance',
      detail: 'Datasets and jobs become auditable assets with explicit lineage, ownership, and lifecycle checkpoints.',
      route: '/datasets',
      cta: 'Review Datasets',
    },
    {
      title: 'System Defense Layer',
      detail: 'Diagnostics and topology views expose weak signals fast, before operator fatigue creates blind spots.',
      route: '/diagnostics',
      cta: 'Run Checks',
    },
  ];

  private readonly sub = new Subscription();

  constructor(
    sidebar: SidebarService,
    private readonly jobsService: JobsService,
    private readonly datasetsService: DatasetsService,
    private readonly telemetryService: TelemetryService,
    private readonly http: HttpClient,
    private readonly dataSource: DataSourceService,
    private readonly mock: MockDataService
  ) {
    this.sub.add(sidebar.collapsed$.subscribe((v) => (this.collapsed = v)));
  }

  ngOnInit(): void {
    this.refreshSnapshot();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  refreshSnapshot(): void {
    this.loadingSnapshot = true;

    const jobs$ = this.probe<JobStatus[]>(this.jobsService.list(), []);
    const datasets$ = this.probe<Dataset[]>(this.datasetsService.list(), []);
    const diagnostics$ = this.dataSource.mode === 'mock'
      ? this.probe<DiagnosticsIndex | null>(this.mock.diagnosticsIndex() as unknown as Observable<DiagnosticsIndex>, null)
      : this.probe<DiagnosticsIndex | null>(this.http.get<DiagnosticsIndex>('/api/diagnostics'), null);
    const up$ = this.probe<number>(this.telemetryService.queryInstant('sum(up)'), 0);

    this.sub.add(
      forkJoin({ jobs: jobs$, datasets: datasets$, diagnostics: diagnostics$, up: up$ }).subscribe((snapshot) => {
        const activeJobs = snapshot.jobs.value.filter((job) => this.isActiveStatus(String(job.status))).length;
        const diagnosticsCount = (snapshot.diagnostics.value?.files || []).filter((f) => f !== '.gitkeep').length;

        this.statCards = [
          {
            label: 'Governed Datasets',
            value: String(snapshot.datasets.value.length),
            note: snapshot.datasets.ok ? 'Authoritative catalog online' : 'Dataset API not reachable',
            tone: 'cyan',
          },
          {
            label: 'Active Jobs',
            value: String(activeJobs),
            note: snapshot.jobs.ok ? `${snapshot.jobs.value.length} total jobs tracked` : 'Jobs API not reachable',
            tone: 'amber',
          },
          {
            label: 'Diagnostics Artifacts',
            value: String(diagnosticsCount),
            note: snapshot.diagnostics.ok ? 'Recent evidence available' : 'Diagnostics endpoint offline',
            tone: 'mint',
          },
          {
            label: 'Prometheus Targets Up',
            value: snapshot.up.ok ? String(Math.max(0, Math.round(snapshot.up.value))) : '0',
            note: snapshot.up.ok ? 'Telemetry heartbeat detected' : 'Prometheus proxy unavailable',
            tone: 'violet',
          },
        ];

        this.quickChecks = [
          {
            label: 'Jobs API',
            status: snapshot.jobs.ok ? 'healthy' : 'degraded',
            detail: snapshot.jobs.ok ? 'Responding with job records' : 'No response from /api/v1/jobs',
            route: '/jobs',
          },
          {
            label: 'Dataset API',
            status: snapshot.datasets.ok ? 'healthy' : 'degraded',
            detail: snapshot.datasets.ok ? 'Catalog query succeeded' : 'No response from /api/v1/datasets',
            route: '/datasets',
          },
          {
            label: 'Diagnostics API',
            status: snapshot.diagnostics.ok ? 'healthy' : 'degraded',
            detail: snapshot.diagnostics.ok ? 'Artifact index loaded' : 'No response from /api/diagnostics',
            route: '/diagnostics',
          },
          {
            label: 'Telemetry Proxy',
            status: snapshot.up.ok ? 'healthy' : 'degraded',
            detail: snapshot.up.ok ? 'Prometheus query returned data' : 'No response from telemetry proxy',
            route: '/telemetry',
          },
        ];

        this.signalBars = [
          {
            label: 'Operational Visibility',
            value: this.toPercent(snapshot.up.ok ? snapshot.up.value * 8 : 16),
            tone: 'cyan',
          },
          {
            label: 'Governance Coverage',
            value: this.toPercent(snapshot.datasets.value.length * 9 + 20),
            tone: 'mint',
          },
          {
            label: 'Orchestration Readiness',
            value: this.toPercent(activeJobs * 12 + (snapshot.jobs.ok ? 36 : 12)),
            tone: 'amber',
          },
          {
            label: 'System Observability',
            value: this.toPercent(diagnosticsCount * 5 + (snapshot.diagnostics.ok ? 34 : 14)),
            tone: 'violet',
          },
        ];

        this.lastUpdated = new Date();
        this.loadingSnapshot = false;
      })
    );
  }

  trackByLabel(_: number, item: { label: string }): string {
    return item.label;
  }

  private probe<T>(source$: Observable<T>, fallback: T): Observable<ProbeResult<T>> {
    return source$.pipe(
      map((value: T): ProbeResult<T> => ({ ok: true, value })),
      catchError(() => of<ProbeResult<T>>({ ok: false, value: fallback }))
    );
  }

  private isActiveStatus(status: string): boolean {
    const normalized = status.toUpperCase();
    return normalized === 'QUEUED' || normalized === 'RUNNING' || normalized === 'SUBMITTED';
  }

  private toPercent(raw: number): number {
    return Math.max(6, Math.min(100, Math.round(raw)));
  }
}

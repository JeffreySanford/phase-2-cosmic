import { HttpClient } from '@angular/common/http';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatTabsModule } from '@angular/material/tabs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { SidebarService } from '../../base/sidebar/sidebar.service';
import { DatasetsService } from '../../services/datasets.service';
import { JobsService } from '../../services/jobs.service';
import { TelemetryService } from '../../services/telemetry.service';
import { LandingComponent } from './landing.component';

class StubSidebar {
  collapsed$ = new BehaviorSubject(false);

  setCollapsed(v: boolean): void {
    this.collapsed$.next(v);
  }
}

class StubJobsService {
  list() {
    return of([
      { jobId: 'j-1', workflow: 'simulate', status: 'RUNNING' },
      { jobId: 'j-2', workflow: 'simulate', status: 'COMPLETED' },
    ]);
  }
}

class StubDatasetsService {
  list() {
    return of([
      { id: 'd-1', name: 'Raw Interferometer Set' },
      { id: 'd-2', name: 'Calibrated SRDP Slice' },
    ]);
  }
}

class StubTelemetryService {
  queryInstant() {
    return of(4);
  }
}

class StubHttpClient {
  get() {
    return of({ path: '/tmp/diagnostics', files: ['system-specs.20260302T190000Z', '.gitkeep'] });
  }
}

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let sidebar: StubSidebar;

  beforeEach(async () => {
    sidebar = new StubSidebar();

    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, MatTabsModule, NoopAnimationsModule],
      declarations: [LandingComponent],
      providers: [
        { provide: SidebarService, useValue: sidebar },
        { provide: JobsService, useClass: StubJobsService },
        { provide: DatasetsService, useClass: StubDatasetsService },
        { provide: TelemetryService, useClass: StubTelemetryService },
        { provide: HttpClient, useClass: StubHttpClient },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the mission heading', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')?.textContent).toContain('Mission control for telemetry, governance, and scientific trust');
  });

  it('shows computed quick stats from snapshot data', () => {
    expect(component.statCards[0].value).toBe('2');
    expect(component.statCards[1].value).toBe('1');
    expect(component.statCards[2].value).toBe('1');
    expect(component.statCards[3].value).toBe('4');
  });

  it('responds to collapse state', () => {
    sidebar.setCollapsed(true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.landing');
    expect(el.classList).toContain('collapsed');
  });
});

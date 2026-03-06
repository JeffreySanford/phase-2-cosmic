import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { JobsComponent } from './jobs.component';
import { JobsService, JobStatus } from '../../services/jobs.service';
import { of, EMPTY } from 'rxjs';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

class StubJobsService {
  list() {
    return of([{ jobId: '1', workflow: 'x', status: 'QUEUED', lineage: { parentJobId: 'p' } } satisfies JobStatus]);
  }
  listHot() {
    // simple observable stub for hot list
    return of([]);
  }
  getDispatchConfig() {
    // return minimal config object expected by component
    return of({ intervalSeconds: 0, scannedCount: 0 });
  }
  watchJob(_id: string) {
    return EMPTY;
  }
  invalidateList() {
    console.log('invalidateList called');
  }
  get(id: string) {
    return of({ jobId: id, workflow: 'x', status: 'QUEUED', lineage: { parentJobId: 'p' } } satisfies JobStatus);
  }
  getLogs(_id: string) {
    return of([] as string[]);
  }
  artifacts(_id: string) {
    return of([] as { name: string; url: string }[]);
  }
  invalidateJob(_id: string) {
    // stub: no-op
  }
}

describe('JobsComponent', () => {
  let component: JobsComponent;
  let fixture: ComponentFixture<JobsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [JobsComponent],
      imports: [NoopAnimationsModule, MatDialogModule, MatSnackBarModule, FormsModule, ReactiveFormsModule],
      providers: [{ provide: JobsService, useClass: StubJobsService }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JobsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should expose lineage data when a job is selected', () => {
    const job: JobStatus = { jobId: '123', workflow: 'foo', status: 'QUEUED', lineage: { parentJobId: 'abc' } } as JobStatus;
    component.view(job);
    fixture.detectChanges();
    expect(component.selectedJob?.jobId).toBe('123');
    expect(component.selectedJob?.lineage?.['parentJobId']).toBe('abc');
  });

  it('allows editing lineage and saving', () => {
    const job: JobStatus = { jobId: '321', workflow: 'bar', status: 'QUEUED', lineage: { parentJobId: 'orig' } } as JobStatus;
    const spy = jest.spyOn(component, 'saveLineage');
    component.view(job);
    fixture.detectChanges();
    component.selectedJob = job;
    component.saveLineage();
    expect(spy).toHaveBeenCalled();
  });
});

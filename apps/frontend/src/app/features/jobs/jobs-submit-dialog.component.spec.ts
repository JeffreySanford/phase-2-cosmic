import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JobsSubmitDialogComponent } from './jobs-submit-dialog.component';
import { JobsLineageEditorComponent } from './jobs-lineage-editor.component';
import { JobsService } from '../../services/jobs.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

class StubJobsService {
  types() {
    return of([]);
  }
}

describe('JobsSubmitDialogComponent', () => {
  let component: JobsSubmitDialogComponent;
  let fixture: ComponentFixture<JobsSubmitDialogComponent>;
  let dialogRefSpy: { close: jest.Mock };

  beforeEach(async () => {
    dialogRefSpy = {
      close: jest.fn(),
    };
    await TestBed.configureTestingModule({
      declarations: [JobsSubmitDialogComponent, JobsLineageEditorComponent],
      imports: [
        FormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatSelectModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: JobsService, useClass: StubJobsService },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: {} },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JobsSubmitDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes with default workflow', () => {
    expect(component.workflow).toBe('import');
  });

  it('parses lineage and parameters on submit', () => {
    component.workflow = 'import';
    component.datasetId = 'ds1';
    component.requestedBy = 'tester';
    component.payloadText = '{"source":"s3://bucket/in","foo":true}';
    component.lineageObj = { parentJobId: 'p-1' };
    component.submit();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      workflow: 'import',
      datasetId: 'ds1',
      lineage: { parentJobId: 'p-1' },
      parameters: { source: 's3://bucket/in', foo: true },
      requestedBy: 'tester',
    });
  });

  it('shows error on invalid lineage JSON', () => {
    component.payloadText = '{';
    component.submit();
    expect(component.error).toBeTruthy();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });
});

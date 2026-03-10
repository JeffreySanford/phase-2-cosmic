import { ComponentFixture, TestBed } from "@angular/core/testing";
import { JobsSubmitDialogComponent } from "./jobs-submit-dialog.component";
import { JobsLineageEditorComponent } from "./jobs-lineage-editor.component";
import { JobsService } from "../../services/jobs.service";
import { VoService } from "../../services/vo.service";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { of } from "rxjs";
import { MatDialogModule } from "@angular/material/dialog";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";

class StubJobsService {
  types() {
    return of([]);
  }

  publicSources() {
    return of([{ name: "NRAO TAP", url: "https://example.org/tap" }]);
  }
}

class StubVoService {
  getServices() {
    return of({ tapUrl: "", dataLinkUrl: "" });
  }
  getSampleForType(_type: string) {
    return null;
  }
}

describe("JobsSubmitDialogComponent", () => {
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
        ReactiveFormsModule,
        HttpClientTestingModule,
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
        { provide: VoService, useClass: StubVoService },
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

  it("initializes with default workflow", () => {
    expect(component.workflow).toBe("ingest");
  });

  it("loads public sources and displays them", () => {
    expect(component.publicSources.length).toBeGreaterThan(0);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain("NRAO TAP");
  });

  it("parses lineage and parameters on submit", () => {
    component.workflow = "import";
    component.datasetId = "ds1";
    component.requestedBy = "tester";
    component.payloadText = '{"source":"s3://bucket/in","foo":true}';
    component.lineageObj = { parentJobId: "p-1" };
    component.submit();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      workflow: "import",
      datasetId: "ds1",
      lineage: { parentJobId: "p-1" },
      parameters: { source: "s3://bucket/in", foo: true },
      requestedBy: "tester",
    });
  });

  it("shows error on invalid lineage JSON", () => {
    component.payloadText = "{";
    component.submit();
    expect(component.error).toBeTruthy();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  describe("workflowGroups", () => {
    it("contains exactly three groups", () => {
      expect(component.workflowGroups.length).toBe(3);
    });

    it("first group is Data Management with 5 types", () => {
      const g = component.workflowGroups[0];
      expect(g.label).toBe("Data Management");
      expect(g.types.length).toBe(5);
    });

    it("maps ingest value to Import label", () => {
      const g = component.workflowGroups[0];
      const ingest = g.types.find((t) => t.value === "ingest");
      expect(ingest?.label).toBe("Import");
    });

    it("second group is VO: Catalog with 4 types", () => {
      const g = component.workflowGroups[1];
      expect(g.label).toBe("VO: Catalog");
      expect(g.types.length).toBe(4);
    });

    it("third group is VO: Data Access with 4 types", () => {
      const g = component.workflowGroups[2];
      expect(g.label).toBe("VO: Data Access");
      expect(g.types.length).toBe(4);
    });

    it("availableTypes includes all values from all groups", () => {
      const allValues = component.workflowGroups.flatMap((g) =>
        g.types.map((t) => t.value)
      );
      expect(component.availableTypes).toEqual(allValues);
      expect(component.availableTypes.length).toBe(13);
    });

    it("all VO group values start with 'vo.'", () => {
      const voGroups = component.workflowGroups.slice(1);
      for (const g of voGroups) {
        for (const t of g.types) {
          expect(t.value.startsWith("vo.")).toBe(true);
        }
      }
    });
  });
});

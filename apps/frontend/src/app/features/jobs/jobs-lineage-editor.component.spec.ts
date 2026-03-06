import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { JobsLineageEditorComponent } from "./jobs-lineage-editor.component";
describe("JobsLineageEditorComponent", () => {
  let component: JobsLineageEditorComponent;
  let fixture: ComponentFixture<JobsLineageEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [JobsLineageEditorComponent],
      imports: [FormsModule, MatIconModule],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JobsLineageEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should render entries and allow add/remove", () => {
    component.lineage = { a: "1", b: "2" };
    component.ngOnChanges();
    fixture.detectChanges();
    const rows: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll(".row")
    );
    expect(rows.length).toBe(2);
    // simulate changing one value
    const inputs = fixture.nativeElement.querySelectorAll("input");
    inputs[1].value = "42";
    inputs[1].dispatchEvent(new Event("input"));
    fixture.detectChanges();
    let emitted: Record<string, unknown> | undefined;
    component.lineageChange.subscribe((v) => (emitted = v));
    component.add();
    expect(component.entries.length).toBe(3);
    component.remove(0);
    expect(component.entries.length).toBe(2);
    // verify emitter fired with updated object
    expect(emitted).toBeTruthy();
  });
});

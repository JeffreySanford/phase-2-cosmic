import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { of, throwError } from "rxjs";
import { DatasetsComponent } from "./datasets.component";
import { DatasetsService } from "../../services/datasets.service";

describe("DatasetsComponent", () => {
  let fixture: ComponentFixture<DatasetsComponent>;
  let component: DatasetsComponent;
  let datasetsService: jest.Mocked<DatasetsService>;

  beforeEach(async () => {
    datasetsService = {
      list: jest.fn(),
      listHot: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<DatasetsService>;

    await TestBed.configureTestingModule({
      declarations: [DatasetsComponent],
      imports: [FormsModule],
      providers: [{ provide: DatasetsService, useValue: datasetsService }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(DatasetsComponent);
    component = fixture.componentInstance;
  });

  it("loads datasets on init", () => {
    datasetsService.list.mockReturnValue(
      of([{ id: "dataset-1", name: "Dataset 1" }])
    );

    fixture.detectChanges();

    expect(datasetsService.list).toHaveBeenCalled();
    expect(component.datasets).toEqual([
      expect.objectContaining({ id: "dataset-1", name: "Dataset 1" }),
    ]);
  });

  it("prepends a created dataset and resets the form", () => {
    datasetsService.list.mockReturnValue(of([]));
    datasetsService.create.mockReturnValue(
      of({
        id: "dataset-2",
        name: "Created Dataset",
        description: "Created description",
      })
    );

    fixture.detectChanges();
    component.name = "Created Dataset";
    component.description = "Created description";

    component.create();

    expect(datasetsService.create).toHaveBeenCalledWith({
      name: "Created Dataset",
      description: "Created description",
    });
    expect(component.datasets[0]).toEqual(
      expect.objectContaining({ id: "dataset-2", name: "Created Dataset" })
    );
    expect(component.name).toBe("");
    expect(component.description).toBe("");
  });

  it("captures reload errors as a user-facing message", () => {
    datasetsService.list.mockReturnValue(
      throwError(() => new Error("dataset load failed"))
    );

    fixture.detectChanges();

    expect(component.error).toBe("dataset load failed");
  });

  it("captures create errors as a user-facing message", () => {
    datasetsService.list.mockReturnValue(of([]));
    datasetsService.create.mockReturnValue(
      throwError(() => ({ message: "dataset create failed" }))
    );

    fixture.detectChanges();
    component.name = "Broken Dataset";
    component.create();

    expect(component.error).toBe("dataset create failed");
  });
});

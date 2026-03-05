import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Component, NO_ERRORS_SCHEMA } from "@angular/core";
import { of } from "rxjs";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { DashboardComponent } from "./dashboard.component";

@Component({ selector: "app-promql-card", template: "" })
class PromqlCardStubComponent {}

describe("DashboardComponent", () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      declarations: [DashboardComponent, PromqlCardStubComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: (
            await import("../../services/data-source.service")
          ).DataSourceService,
          useValue: { mode: "live", mode$: of("live") },
        },
        {
          provide: (
            await import("../../services/mock-data.service")
          ).MockDataService,
          useValue: { diagnosticsIndex: () => of({ path: "", files: [] }) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("renders container and header", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h1")?.textContent).toContain("Dashboard");
  });
});

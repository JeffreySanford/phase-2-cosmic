import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SidebarComponent } from "./sidebar.component";

describe("SidebarComponent", () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SidebarComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("renders only available routes with icons and labels", () => {
    component.systemStatus = {
      health: "healthy",
      lastCheck: new Date(),
      services: {
        governance: "online",
        telemetry: "online",
        diagnostics: "online",
        topology: "online",
        forge: "online",
      },
    };
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll("li");
    expect(items.length).toBe(component.visibleRoutes.length);
    items.forEach((el: HTMLElement, idx: number) => {
      const icon = el.querySelector(".icon")?.textContent?.trim();
      const label = el.querySelector(".label")?.textContent?.trim();
      expect(icon).toBe(component.visibleRoutes[idx].icon);
      expect(label).toBe(component.visibleRoutes[idx].label);
    });
  });
});

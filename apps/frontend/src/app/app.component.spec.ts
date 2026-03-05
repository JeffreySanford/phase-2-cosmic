import { TestBed } from "@angular/core/testing";
import { Component } from "@angular/core";
import { AppComponent } from "./app.component";
import { Router } from "@angular/router";
import { SidebarService } from "./base/sidebar/sidebar.service";

@Component({ selector: "app-header", template: "" })
class HeaderStubComponent {}
@Component({ selector: "app-status-band", template: "" })
class StatusBandStubComponent {}
@Component({ selector: "app-sidebar", template: "" })
class SidebarStubComponent {}
@Component({ selector: "app-mainstage", template: "" })
class MainstageStubComponent {}
@Component({ selector: "app-footer", template: "" })
class FooterStubComponent {}

describe("AppComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        AppComponent,
        HeaderStubComponent,
        StatusBandStubComponent,
        SidebarStubComponent,
        MainstageStubComponent,
        FooterStubComponent,
      ],
      providers: [
        {
          provide: Router,
          useValue: { navigate: () => Promise.resolve(true) },
        },
        {
          provide: SidebarService,
          useValue: { setCollapsed: () => undefined },
        },
      ],
    }).compileComponents();
  });

  it("should render title", () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual("frontend");
  });

  it(`should have as title 'frontend'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual("frontend");
  });
});

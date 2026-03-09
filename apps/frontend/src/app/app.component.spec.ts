import { TestBed } from "@angular/core/testing";
import { Component } from "@angular/core";
import { AppComponent } from "./app.component";
import { Router } from "@angular/router";
import { SidebarService } from "./base/sidebar/sidebar.service";
import {
  MAT_DIALOG_DEFAULT_OPTIONS,
  MatDialogConfig,
} from "@angular/material/dialog";

@Component({ selector: "app-header", template: "", standalone: false })
class HeaderStubComponent {}
@Component({ selector: "app-status-band", template: "", standalone: false })
class StatusBandStubComponent {}
@Component({ selector: "app-sidebar", template: "", standalone: false })
class SidebarStubComponent {}
@Component({ selector: "app-mainstage", template: "", standalone: false })
class MainstageStubComponent {}
@Component({ selector: "app-footer", template: "", standalone: false })
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

// ── S1-2: MAT_DIALOG_DEFAULT_OPTIONS accessibility fix ───────────────────────
// The AppModule provides { ariaModal: true } so Angular CDK uses the
// aria-modal attribute on the dialog overlay instead of setting
// aria-hidden="true" on <app-root>, eliminating the focus-trap console warning.

describe("AppModule accessibility: MAT_DIALOG_DEFAULT_OPTIONS (S1-2)", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { ariaModal: true } satisfies Partial<MatDialogConfig>,
        },
      ],
    });
  });

  it("provides ariaModal=true to prevent aria-hidden on <app-root>", () => {
    const opts = TestBed.inject<MatDialogConfig>(MAT_DIALOG_DEFAULT_OPTIONS);
    expect(opts.ariaModal).toBe(true);
  });
});

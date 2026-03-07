import { ComponentFixture, TestBed } from "@angular/core/testing";
import { DisclaimerBannerComponent } from "./disclaimer-banner.component";
import { CommonModule } from "@angular/common";
import { DataSourceService } from "../../services/data-source.service";
import { BehaviorSubject } from "rxjs";

describe("DisclaimerBannerComponent", () => {
  let component: DisclaimerBannerComponent;
  let fixture: ComponentFixture<DisclaimerBannerComponent>;
  let mode$: BehaviorSubject<"live" | "mock">;

  beforeEach(async () => {
    mode$ = new BehaviorSubject<"live" | "mock">("mock");
    await TestBed.configureTestingModule({
      declarations: [DisclaimerBannerComponent],
      imports: [CommonModule],
      providers: [
        {
          provide: DataSourceService,
          useValue: {
            mode$: mode$.asObservable(),
            get mode() {
              return mode$.value;
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DisclaimerBannerComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("type: modeling", () => {
    beforeEach(() => {
      component.type = "modeling";
      fixture.detectChanges();
    });

    it("should display modeling disclaimer message", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const message = compiled.querySelector(".disclaimer-banner__text");
      expect(message?.textContent?.toLowerCase()).toContain("model");
    });

    it("should apply modeling class", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector(".disclaimer-banner");
      expect(banner?.classList.contains("disclaimer-banner--modeling")).toBe(
        true
      );
    });

    it("should display warning icon", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const icon = compiled.querySelector(".disclaimer-banner__icon");
      expect(icon).toBeTruthy();
    });
  });

  describe("type: demo", () => {
    beforeEach(() => {
      component.type = "demo";
      fixture.detectChanges();
    });

    it("should display demo disclaimer message", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const message = compiled.querySelector(".disclaimer-banner__text");
      expect(message?.textContent?.toLowerCase()).toContain("demonstrat");
    });

    it("should apply demo class", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector(".disclaimer-banner");
      expect(banner?.classList.contains("disclaimer-banner--demo")).toBe(true);
    });
  });

  describe("type: development", () => {
    beforeEach(() => {
      component.type = "development";
      fixture.detectChanges();
    });

    it("should display development disclaimer message", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const message = compiled.querySelector(".disclaimer-banner__text");
      expect(message?.textContent?.toLowerCase()).toContain("develop");
    });

    it("should apply development class", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector(".disclaimer-banner");
      expect(banner?.classList.contains("disclaimer-banner--development")).toBe(
        true
      );
    });
  });

  describe("type: simulation", () => {
    beforeEach(() => {
      component.type = "simulation";
      fixture.detectChanges();
    });

    it("should display simulation disclaimer message", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const message = compiled.querySelector(".disclaimer-banner__text");
      expect(message?.textContent?.toLowerCase()).toContain("simul");
    });

    it("should apply simulation class", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector(".disclaimer-banner");
      expect(banner?.classList.contains("disclaimer-banner--simulation")).toBe(
        true
      );
    });
  });

  describe("dismissible", () => {
    beforeEach(() => {
      component.type = "modeling";
      component.dismissible = true;
      fixture.detectChanges();
    });

    it("should show dismiss button when dismissible is true", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const dismissButton = compiled.querySelector(
        ".disclaimer-banner__dismiss"
      );
      expect(dismissButton).toBeTruthy();
    });

    it("should hide banner when dismiss button is clicked", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const dismissButton = compiled.querySelector(
        ".disclaimer-banner__dismiss"
      ) as HTMLButtonElement;

      expect(component.dismissed).toBe(false);

      dismissButton.click();
      fixture.detectChanges();

      expect(component.dismissed).toBe(true);
      expect(compiled.querySelector(".disclaimer-banner")).toBeFalsy();
    });

    it("should not show dismiss button when dismissible is false", () => {
      component.dismissible = false;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const dismissButton = compiled.querySelector(
        ".disclaimer-banner__dismiss"
      );
      expect(dismissButton).toBeFalsy();
    });
  });

  describe("custom message", () => {
    it("should display custom message when provided", () => {
      component.type = "modeling";
      component.message = "Custom test message";
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const message = compiled.querySelector(".disclaimer-banner__text");
      expect(message?.textContent).toContain("Custom test message");
    });

    it("should use default message when no custom message provided", () => {
      component.type = "modeling";
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const message = compiled.querySelector(".disclaimer-banner__text");
      expect(message?.textContent?.toLowerCase()).toContain("model");
      expect(message?.textContent).not.toContain("Custom");
    });
  });

  describe("methods", () => {
    it("should set dismissed to true when dismiss is called", () => {
      component.dismissed = false;
      component.dismiss();
      expect(component.dismissed).toBe(true);
    });

    it("should return correct message for each type", () => {
      component.type = "modeling";
      expect(component.defaultMessage.toLowerCase()).toContain("model");

      component.type = "demo";
      expect(component.defaultMessage.toLowerCase()).toContain("demonstrat");

      component.type = "development";
      expect(component.defaultMessage.toLowerCase()).toContain("develop");

      component.type = "simulation";
      expect(component.defaultMessage.toLowerCase()).toContain("simul");
    });

    it("hides demo/modeling banners in live mode by default", () => {
      mode$.next("live");
      component.type = "demo";
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector(".disclaimer-banner")).toBeFalsy();
    });

    it("shows banner only after ready becomes true", () => {
      component.type = "demo";
      component.ready = false;
      fixture.detectChanges();

      let compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector(".disclaimer-banner")).toBeFalsy();

      component.ready = true;
      fixture.detectChanges();
      compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector(".disclaimer-banner")).toBeTruthy();
    });

    it("can be forced visible in live mode when requireMockMode is false", () => {
      mode$.next("live");
      component.type = "modeling";
      component.requireMockMode = false;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector(".disclaimer-banner")).toBeTruthy();
    });
  });

  describe("accessibility", () => {
    beforeEach(() => {
      component.type = "modeling";
      component.dismissible = true;
      fixture.detectChanges();
    });

    it('should have role="alert"', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector(".disclaimer-banner");
      expect(banner?.getAttribute("role")).toBe("alert");
    });

    it("should have aria-label on dismiss button", () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const dismissButton = compiled.querySelector(
        ".disclaimer-banner__dismiss"
      );
      expect(dismissButton?.getAttribute("aria-label")).toBeTruthy();
    });
  });
});

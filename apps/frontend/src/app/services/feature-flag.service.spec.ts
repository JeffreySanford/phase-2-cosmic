import { TestBed } from "@angular/core/testing";
import { FeatureFlagService } from "./feature-flag.service";

describe("FeatureFlagService", () => {
  let service: FeatureFlagService;

  beforeEach(() => {
    localStorage.removeItem("cosmic.featureFlags");
    TestBed.configureTestingModule({});
    service = TestBed.inject(FeatureFlagService);
  });

  it("should have all flags disabled by default", () => {
    expect(service.isEnabled("trident.fsp-allocator")).toBe(false);
    expect(service.isEnabled("trident.execution-plans")).toBe(false);
    expect(service.isEnabled("trident.mode-routing")).toBe(false);
    expect(service.isEnabled("jobs.lineage")).toBe(false);
  });

  it("should override a flag and persist to localStorage", () => {
    service.override({ "trident.execution-plans": true });

    expect(service.isEnabled("trident.execution-plans")).toBe(true);
    expect(service.isEnabled("trident.fsp-allocator")).toBe(false); // others unchanged

    const stored = JSON.parse(localStorage.getItem("cosmic.featureFlags")!);
    expect(stored["trident.execution-plans"]).toBe(true);
  });

  it("should restore persisted overrides on re-inject", () => {
    service.override({ "jobs.lineage": true });

    // Simulate reinitialisation from fresh TestBed
    const reloaded = new (FeatureFlagService as any)();
    expect(reloaded.isEnabled("jobs.lineage")).toBe(true);
  });

  it("should reset to defaults and clear storage", () => {
    service.override({ "trident.execution-plans": true });
    service.reset();

    expect(service.isEnabled("trident.execution-plans")).toBe(false);
    expect(localStorage.getItem("cosmic.featureFlags")).toBeNull();
  });

  it("should emit updated flags on the flags$ observable", (done) => {
    service.flags$.subscribe((flags) => {
      if (flags["trident.mode-routing"]) {
        expect(flags["trident.mode-routing"]).toBe(true);
        done();
      }
    });
    service.override({ "trident.mode-routing": true });
  });
});

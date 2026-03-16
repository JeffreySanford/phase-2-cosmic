import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from "@angular/material/slide-toggle";
import { MatMenuModule } from "@angular/material/menu";
import { Router } from "@angular/router";
import { FooterComponent } from "./footer.component";
import { LoadProfileService } from "../../services/load-profile.service";
import { DataSourceService } from "../../services/data-source.service";
import { of } from "rxjs";

describe("FooterComponent", () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let setProfileSpy: jest.Mock;
  let setStressSpy: jest.Mock;

  beforeEach(async () => {
    setProfileSpy = jest.fn();
    setStressSpy = jest.fn();
    const mockLoadProfile = {
      pollingMs$: of(1000),
      profile$: of(50),
      mode$: of("runtime-controlled"),
      stress$: of(false),
      setProfile: setProfileSpy,
      setStress: setStressSpy,
    } as unknown as LoadProfileService;

    const mockDataSource = {
      mode: "live",
      mode$: of("live"),
      setMode: jest.fn(),
    } as unknown as DataSourceService;

    const mockRouter = {
      url: "/topology",
      events: of(),
    } as unknown as Router;

    await TestBed.configureTestingModule({
      declarations: [FooterComponent],
      imports: [MatSlideToggleModule, MatMenuModule],
      providers: [
        { provide: LoadProfileService, useValue: mockLoadProfile },
        { provide: DataSourceService, useValue: mockDataSource },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should forward setProfile to service", () => {
    component.setProfile(25);
    expect(setProfileSpy).toHaveBeenCalledWith(25);
  });

  it("should set data mode when setMode called", () => {
    const ds = TestBed.inject(DataSourceService) as unknown as {
      setMode: jest.Mock;
    };
    component.setMode("mock");
    expect(ds.setMode).toHaveBeenCalledWith("mock");
  });

  it("should set stress mode when toggled", () => {
    component.onStressToggle({ checked: true } as MatSlideToggleChange);
    expect(setStressSpy).toHaveBeenCalledWith(true);
  });
});

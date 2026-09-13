import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { MatDialog } from "@angular/material/dialog";
import { RouterTestingModule } from "@angular/router/testing";
import { HeaderComponent } from "./header.component";
import { SettingsDialogComponent } from "../../features/settings/settings-dialog.component";
import { SettingsService } from "../../features/settings/settings.service";
import { DEFAULT_USER_SETTINGS } from "../../features/settings/settings.model";

describe("HeaderComponent", () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let dialogOpenSpy: jest.Mock;
  let settingsService: Pick<SettingsService, "current">;

  beforeEach(async () => {
    dialogOpenSpy = jest.fn();
    settingsService = {
      current: {
        ...DEFAULT_USER_SETTINGS,
        profile: {
          ...DEFAULT_USER_SETTINGS.profile,
          displayName: "Ada Lovelace",
          role: "data-steward",
        },
      },
    };
    await TestBed.configureTestingModule({
      declarations: [HeaderComponent],
      imports: [MatButtonModule, MatMenuModule, RouterTestingModule],
      providers: [
        { provide: MatDialog, useValue: { open: dialogOpenSpy } },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should open settings dialog", () => {
    component.openSettingsModal();
    expect(dialogOpenSpy).toHaveBeenCalledWith(
      SettingsDialogComponent,
      expect.objectContaining({ panelClass: "settings-dialog-panel" })
    );
  });

  it("shows the active console role in the user menu", () => {
    expect(component.roleLabel).toBe("Data Steward");
    expect(fixture.nativeElement.textContent).toContain("Data Steward");
    expect(fixture.nativeElement.textContent).toContain("Ada Lovelace");
  });
});

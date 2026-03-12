import { Component, inject } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";
import { SettingsService } from "./settings.service";
import { DEFAULT_USER_SETTINGS, UserSettings } from "./settings.model";

@Component({
  selector: "app-settings-dialog",
  templateUrl: "./settings-dialog.component.html",
  styleUrls: ["./settings-dialog.component.scss"],
  standalone: false,
})
export class SettingsDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly settings = inject(SettingsService);
  private readonly dialogRef =
    inject<MatDialogRef<SettingsDialogComponent>>(MatDialogRef);

  readonly form;

  constructor() {
    this.form = this.fb.group({
      displayName: [
        this.settings.current.profile.displayName,
        [Validators.required, Validators.maxLength(64)],
      ],
      email: [
        this.settings.current.profile.email,
        [Validators.required, Validators.email],
      ],
      timezone: [this.settings.current.profile.timezone, [Validators.required]],
      language: [this.settings.current.profile.language, [Validators.required]],
      themeMode: [
        this.settings.current.preferences.themeMode,
        [Validators.required],
      ],
      accentColor: [
        this.settings.current.preferences.accentColor,
        [Validators.required],
      ],
      reduceMotion: [
        this.settings.current.preferences.reduceMotion,
        [Validators.required],
      ],
      compactDensity: [
        this.settings.current.preferences.compactDensity,
        [Validators.required],
      ],
      defaultLandingRoute: [
        this.settings.current.application.defaultLandingRoute,
        [Validators.required],
      ],
      autoRefreshSeconds: [
        this.settings.current.application.autoRefreshSeconds,
        [Validators.required, Validators.min(5), Validators.max(300)],
      ],
      telemetryWindowSeconds: [
        this.settings.current.application.telemetryWindowSeconds,
        [Validators.required, Validators.min(60), Validators.max(3600)],
      ],
      showModelingDisclaimers: [
        this.settings.current.application.showModelingDisclaimers,
        [Validators.required],
      ],
      showAdvancedDiagnostics: [
        this.settings.current.application.showAdvancedDiagnostics,
        [Validators.required],
      ],
      inAppToasts: [
        this.settings.current.notifications.inAppToasts,
        [Validators.required],
      ],
      warnOnHighLoad: [
        this.settings.current.notifications.warnOnHighLoad,
        [Validators.required],
      ],
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const next: UserSettings = {
      profile: {
        displayName: String(v.displayName ?? ""),
        email: String(v.email ?? ""),
        timezone: String(v.timezone ?? ""),
        language: String(v.language ?? ""),
      },
      preferences: {
        themeMode: (v.themeMode ??
          DEFAULT_USER_SETTINGS.preferences
            .themeMode) as UserSettings["preferences"]["themeMode"],
        accentColor: String(
          v.accentColor ?? DEFAULT_USER_SETTINGS.preferences.accentColor
        ),
        reduceMotion: !!v.reduceMotion,
        compactDensity: !!v.compactDensity,
      },
      application: {
        defaultLandingRoute: String(
          v.defaultLandingRoute ??
            DEFAULT_USER_SETTINGS.application.defaultLandingRoute
        ),
        autoRefreshSeconds: Number(
          v.autoRefreshSeconds ??
            DEFAULT_USER_SETTINGS.application.autoRefreshSeconds
        ),
        telemetryWindowSeconds: Number(
          v.telemetryWindowSeconds ??
            DEFAULT_USER_SETTINGS.application.telemetryWindowSeconds
        ),
        showModelingDisclaimers: !!v.showModelingDisclaimers,
        showAdvancedDiagnostics: !!v.showAdvancedDiagnostics,
      },
      notifications: {
        inAppToasts: !!v.inAppToasts,
        warnOnHighLoad: !!v.warnOnHighLoad,
      },
    };
    this.settings.update(next);
    this.dialogRef.close(next);
  }

  resetDefaults(): void {
    this.form.patchValue({
      displayName: DEFAULT_USER_SETTINGS.profile.displayName,
      email: DEFAULT_USER_SETTINGS.profile.email,
      timezone: DEFAULT_USER_SETTINGS.profile.timezone,
      language: DEFAULT_USER_SETTINGS.profile.language,
      themeMode: DEFAULT_USER_SETTINGS.preferences.themeMode,
      accentColor: DEFAULT_USER_SETTINGS.preferences.accentColor,
      reduceMotion: DEFAULT_USER_SETTINGS.preferences.reduceMotion,
      compactDensity: DEFAULT_USER_SETTINGS.preferences.compactDensity,
      defaultLandingRoute:
        DEFAULT_USER_SETTINGS.application.defaultLandingRoute,
      autoRefreshSeconds: DEFAULT_USER_SETTINGS.application.autoRefreshSeconds,
      telemetryWindowSeconds:
        DEFAULT_USER_SETTINGS.application.telemetryWindowSeconds,
      showModelingDisclaimers:
        DEFAULT_USER_SETTINGS.application.showModelingDisclaimers,
      showAdvancedDiagnostics:
        DEFAULT_USER_SETTINGS.application.showAdvancedDiagnostics,
      inAppToasts: DEFAULT_USER_SETTINGS.notifications.inAppToasts,
      warnOnHighLoad: DEFAULT_USER_SETTINGS.notifications.warnOnHighLoad,
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}

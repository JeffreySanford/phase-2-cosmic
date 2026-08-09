import {
  NgModule,
  CUSTOM_ELEMENTS_SCHEMA,
  inject,
  provideAppInitializer,
  isDevMode,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatTooltipModule } from "@angular/material/tooltip";
import { LayoutModule } from "@angular/cdk/layout";
import { RouterModule } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import {
  MatDialogModule,
  MAT_DIALOG_DEFAULT_OPTIONS,
} from "@angular/material/dialog";
import { HttpClientModule } from "@angular/common/http";
import { DOCUMENT } from "@angular/common";
import { EffectsModule } from "@ngrx/effects";
import { StoreModule } from "@ngrx/store";
import { StoreDevtoolsModule } from "@ngrx/store-devtools";

import { AppComponent } from "./app.component";
import { SharedModule } from "./shared/shared.module";

import { DataSourceService } from "./services/data-source.service";
import { appRoutes } from "./app.routes";
import { ShellModule } from "./base/shell.module";
import { LandingComponent } from "./features/landing/landing.component";
import { SettingsComponent } from "./features/settings/settings.component";
import { SettingsDialogComponent } from "./features/settings/settings-dialog.component";
import { ViewerComponent } from "./features/viewer/viewer.component";
import { JobEventsComponent } from "./features/job-events/job-events.component";
import { StatusBandModule } from "./shared/status-band/status-band.module";

@NgModule({
  declarations: [
    LandingComponent,
    SettingsComponent,
    SettingsDialogComponent,
    ViewerComponent,
    JobEventsComponent,
  ],
  imports: [
    CommonModule,
    BrowserModule,
    BrowserAnimationsModule,
    MatButtonModule,
    MatSlideToggleModule,
    LayoutModule,
    RouterModule.forRoot(appRoutes),
    HttpClientModule,
    StoreModule.forRoot(
      {},
      {
        runtimeChecks: {
          strictStateImmutability: true,
          strictActionImmutability: true,
          strictStateSerializability: true,
          strictActionSerializability: true,
        },
      }
    ),
    EffectsModule.forRoot([]),
    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: !isDevMode(),
      autoPause: true,
    }),
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatDialogModule,
    MatTooltipModule,
    ShellModule,
    StatusBandModule,
    SharedModule,
    AppComponent,
  ],
  providers: [
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: { ariaModal: true },
    },
    provideAppInitializer(() => {
      const initializerFn = ((dataSource: DataSourceService) => () => {
        try {
          const document = inject(DOCUMENT, { optional: true });
          const params = new URLSearchParams(
            document?.defaultView?.location?.search ?? ""
          );
          if (params.get("mode") === "mock") {
            dataSource.setMode("mock");
          }
        } catch {
          // ignore
        }
        return Promise.resolve();
      })(inject(DataSourceService));
      return initializerFn();
    }),
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}

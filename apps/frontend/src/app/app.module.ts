import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { LayoutModule } from "@angular/cdk/layout";
import { RouterModule } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatMenuModule } from "@angular/material/menu";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import {
  MatDialogModule,
  MAT_DIALOG_DEFAULT_OPTIONS,
} from "@angular/material/dialog";
import { MatTabsModule } from "@angular/material/tabs";
import { HttpClientModule } from "@angular/common/http";

import { AppComponent } from "./app.component";
import { APP_INITIALIZER } from "@angular/core";
import { DataSourceService } from "./services/data-source.service";
import { appRoutes } from "./app.routes";
import { UiThemeComponent } from "ui-theme";
import { HeaderComponent } from "./base/header/header.component";
import { FooterComponent } from "./base/footer/footer.component";
import { SidebarComponent } from "./base/sidebar/sidebar.component";
import { MainstageComponent } from "./base/mainstage/mainstage.component";
import { EnvironmentComponent } from "./base/environment/environment.component";
import { LandingComponent } from "./features/landing/landing.component";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { TopologyComponent } from "./features/topology/topology.component";
import { TopologyInfoDialogComponent } from "./features/topology/topology-info-dialog.component";
import { DiagnosticsComponent } from "./features/diagnostics/diagnostics.component";
import { TelemetryModule } from "./features/telemetry/telemetry.module";
import { PromqlCardComponent } from "./shared/promql-card/promql-card.component";
import { SettingsComponent } from "./features/settings/settings.component";
import { SettingsDialogComponent } from "./features/settings/settings-dialog.component";
import { ViewerComponent } from "./features/viewer/viewer.component";
import { JobsComponent } from "./features/jobs/jobs.component";
import { JobsSubmitDialogComponent } from "./features/jobs/jobs-submit-dialog.component";
import { JobsLineageEditorComponent } from "./features/jobs/jobs-lineage-editor.component";
import { DatasetsComponent } from "./features/datasets/datasets.component";
import { JobEventsComponent } from "./features/job-events/job-events.component";
import { PageStateModule } from "./shared/page-state/page-state.module";
import { StatusBandModule } from "./shared/status-band/status-band.module";
import { DisclaimerBannerModule } from "./shared/disclaimer-banner/disclaimer-banner.module";
import { ProvenancePanelModule } from "./shared/provenance-panel/provenance-panel.module";
import { ExternalSourcesComponent } from "./shared/external-sources/external-sources.component";

@NgModule({
  declarations: [
    AppComponent,
    UiThemeComponent,
    HeaderComponent,
    FooterComponent,
    SidebarComponent,
    MainstageComponent,
    EnvironmentComponent,
    LandingComponent,
    DashboardComponent,
    TopologyComponent,
    TopologyInfoDialogComponent,
    DiagnosticsComponent,
    // telemetry components moved into feature module
    PromqlCardComponent,
    SettingsComponent,
    SettingsDialogComponent,
    ViewerComponent,
    JobsComponent,
    JobsSubmitDialogComponent,
    JobsLineageEditorComponent,
    DatasetsComponent,
    ExternalSourcesComponent,
    JobEventsComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MatSnackBarModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    LayoutModule,
    RouterModule.forRoot(appRoutes),
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    MatMenuModule,
    MatInputModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatTabsModule,
    MatTooltipModule,
    PageStateModule,
    StatusBandModule,
    DisclaimerBannerModule,
    ProvenancePanelModule,
    TelemetryModule,
  ],
  providers: [
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: { ariaModal: true },
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (dataSource: DataSourceService) => () => {
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get("mode") === "mock") {
            dataSource.setMode("mock");
          }
        } catch {
          // ignore
        }
        return Promise.resolve();
      },
      deps: [DataSourceService],
      multi: true,
    },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  bootstrap: [AppComponent],
})
export class AppModule {}

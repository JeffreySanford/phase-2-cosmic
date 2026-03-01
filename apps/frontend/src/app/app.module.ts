import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { LayoutModule } from '@angular/cdk/layout';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { appRoutes } from './app.routes';
import { UiThemeComponent } from 'ui-theme';
import { UiVisualizationComponent } from 'ui-visualization';
import { HeaderComponent } from './base/header/header.component';
import { FooterComponent } from './base/footer/footer.component';
import { SidebarComponent } from './base/sidebar/sidebar.component';
import { MainstageComponent } from './base/mainstage/mainstage.component';
import { EnvironmentComponent } from './base/environment/environment.component';
import { LandingComponent } from './features/landing/landing.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { TopologyComponent } from './features/topology/topology.component';
import { DiagnosticsComponent } from './features/diagnostics/diagnostics.component';
import { TelemetryComponent } from './features/telemetry/telemetry.component';
import { PromqlCardComponent } from './shared/promql-card/promql-card.component';
import { SettingsComponent } from './features/settings/settings.component';
import { ViewerComponent } from './features/viewer/viewer.component';
import { JobsComponent } from './features/jobs/jobs.component';
import { JobsSubmitDialogComponent } from './features/jobs/jobs-submit-dialog.component';
import { DatasetsComponent } from './features/datasets/datasets.component';
import { DatasetsService } from './services/datasets.service';

@NgModule({
  declarations: [
    AppComponent,
    UiThemeComponent,
    UiVisualizationComponent,
    HeaderComponent,
    FooterComponent,
    SidebarComponent,
    MainstageComponent,
    EnvironmentComponent,
    LandingComponent,
    DashboardComponent,
    TopologyComponent,
    DiagnosticsComponent,
    TelemetryComponent,
    PromqlCardComponent,
    SettingsComponent,
    ViewerComponent
    ,JobsComponent,
    JobsSubmitDialogComponent
    ,DatasetsComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MatSnackBarModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatSlideToggleModule,
    LayoutModule,
    RouterModule.forRoot(appRoutes),
    HttpClientModule,
    FormsModule,
    MatMenuModule,
    MatInputModule,
    MatIconModule,
    MatDialogModule,
  ],
  providers: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  bootstrap: [AppComponent],
})
export class AppModule {}

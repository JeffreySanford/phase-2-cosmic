import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
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
import { SettingsComponent } from './features/settings/settings.component';
import { ViewerComponent } from './features/viewer/viewer.component';

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
    SettingsComponent,
    ViewerComponent
  ],
  imports: [BrowserModule, BrowserAnimationsModule, MatSnackBarModule, RouterModule.forRoot(appRoutes), HttpClientModule],
  providers: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  bootstrap: [AppComponent],
})
export class AppModule {}

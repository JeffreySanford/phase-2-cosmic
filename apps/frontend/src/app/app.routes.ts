import { Route } from '@angular/router';
import { UiVisualizationComponent } from 'ui-visualization';
import { ViewerComponent } from './features/viewer/viewer.component';
import { LandingComponent } from './features/landing/landing.component';
import { SettingsComponent } from './features/settings/settings.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { TopologyComponent } from './features/topology/topology.component';
import { DiagnosticsComponent } from './features/diagnostics/diagnostics.component';

export const appRoutes: Route[] = [
  { path: 'view', component: ViewerComponent },
  { path: 'landing', component: LandingComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'visualizations', component: UiVisualizationComponent },
  { path: 'topology', component: TopologyComponent },
  { path: 'diagnostics', component: DiagnosticsComponent },
  { path: 'settings', component: SettingsComponent },
  { path: '', redirectTo: '/landing', pathMatch: 'full' },
  { path: '**', redirectTo: '/landing' },
];

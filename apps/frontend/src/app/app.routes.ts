import { Route } from "@angular/router";
import { ViewerComponent } from "./features/viewer/viewer.component";
import { LandingComponent } from "./features/landing/landing.component";
import { SettingsComponent } from "./features/settings/settings.component";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { TopologyComponent } from "./features/topology/topology.component";
import { DiagnosticsComponent } from "./features/diagnostics/diagnostics.component";
import { TelemetryComponent } from "./features/telemetry/telemetry.component";
import { JobsComponent } from "./features/jobs/jobs.component";
import { DatasetsComponent } from "./features/datasets/datasets.component";

export const appRoutes: Route[] = [
  { path: "view", component: ViewerComponent },
  { path: "landing", component: LandingComponent },
  { path: "dashboard", component: DashboardComponent },
  {
    path: "visualizations",
    loadChildren: () =>
      import("./features/visualization/visualization.module").then(
        (m) => m.VisualizationModule
      ),
  },
  { path: "topology", component: TopologyComponent },
  { path: "diagnostics", component: DiagnosticsComponent },
  { path: "telemetry", component: TelemetryComponent },
  { path: "jobs", component: JobsComponent },
  { path: "datasets", component: DatasetsComponent },
  { path: "settings", component: SettingsComponent },
  { path: "", redirectTo: "/landing", pathMatch: "full" },
  { path: "**", redirectTo: "/landing" },
];

import { Route } from "@angular/router";
import { ViewerComponent } from "./features/viewer/viewer.component";
import { LandingComponent } from "./features/landing/landing.component";
import { SettingsComponent } from "./features/settings/settings.component";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { DiagnosticsComponent } from "./features/diagnostics/diagnostics.component";

export const appRoutes: Route[] = [
  { path: "landing", component: LandingComponent },
  { path: "dashboard", component: DashboardComponent },
  { path: "view", component: ViewerComponent },
  {
    path: "visualizations",
    loadChildren: () =>
      import("./features/visualization/visualization.module").then(
        (m) => m.VisualizationModule
      ),
  },
  {
    path: "topology",
    loadChildren: () =>
      import("./features/topology/topology.module").then(
        (m) => m.TopologyModule
      ),
  },
  { path: "diagnostics", component: DiagnosticsComponent },
  {
    path: "jobs",
    loadChildren: () =>
      import("./features/jobs/jobs.module").then((m) => m.JobsModule),
  },
  {
    path: "datasets",
    loadChildren: () =>
      import("./features/datasets/datasets.module").then(
        (m) => m.DatasetsModule
      ),
  },
  {
    path: "telemetry",
    loadChildren: () =>
      import("./features/telemetry/telemetry.module").then(
        (m) => m.TelemetryModule
      ),
  },
  {
    path: "forge",
    loadChildren: () =>
      import("./features/forge/forge.module").then((m) => m.ForgeModule),
  },
  { path: "settings", component: SettingsComponent },
  { path: "", redirectTo: "/landing", pathMatch: "full" },
  { path: "**", redirectTo: "/landing" },
];

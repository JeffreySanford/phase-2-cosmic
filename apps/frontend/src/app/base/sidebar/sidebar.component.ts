import { Component, Input, Output, EventEmitter, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";
import { SystemStatus, SystemStatusService } from "../../services/system-status.service";

interface SidebarRoute {
  path: string;
  label: string;
  icon: string; // could be a material icon name or emoji
  requiredService?: keyof SystemStatus["services"];
}

@Component({
  selector: "app-sidebar",
  templateUrl: "./sidebar.component.html",
  styleUrls: ["./sidebar.component.scss"],
  standalone: false,
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() collapsed = false;
  @Output() navigate = new EventEmitter<string>();

  systemStatus: SystemStatus = {
    health: "offline",
    lastCheck: new Date(),
    services: {
      governance: "offline",
      telemetry: "offline",
      diagnostics: "offline",
      topology: "offline",
      forge: "offline",
    },
  };

  private statusSub?: Subscription;

  routes: SidebarRoute[] = [
    { path: "/landing", label: "Home", icon: "🏠" },
    { path: "/dashboard", label: "Dashboard", icon: "📈" },
    { path: "/view", label: "Viewer", icon: "👀" },
    { path: "/visualizations", label: "Visualizations", icon: "📊" },
    { path: "/jobs", label: "Jobs", icon: "🗂️" },
    { path: "/forge", label: "Forge", icon: "🪐", requiredService: "forge" },
    { path: "/topology", label: "Topology", icon: "🗺️", requiredService: "topology" },
    { path: "/telemetry", label: "Telemetry", icon: "📡", requiredService: "telemetry" },
    { path: "/diagnostics", label: "Diagnostics", icon: "🛠️", requiredService: "diagnostics" },
  ];

  constructor(private systemStatusService: SystemStatusService) {}

  ngOnInit(): void {
    this.statusSub = this.systemStatusService.status$.subscribe((status) => {
      this.systemStatus = status;
    });
  }

  ngOnDestroy(): void {
    this.statusSub?.unsubscribe();
  }

  get visibleRoutes(): SidebarRoute[] {
    return this.routes.filter((route) => this.routeAvailable(route));
  }

  private routeAvailable(route: SidebarRoute): boolean {
    if (!route.requiredService) {
      return true;
    }
    return this.systemStatus.services[route.requiredService] === "online";
  }

  onNavigate(path: string) {
    if (this.routeAvailable({ path, label: "", icon: "" })) {
      this.navigate.emit(path);
    }
  }
}

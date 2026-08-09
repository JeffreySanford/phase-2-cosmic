import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { SidebarService } from "./base/sidebar/sidebar.service";
import { StartupWarmService } from "./services/startup-warm.service";
import { ShellModule } from "./base/shell.module";
import { StatusBandModule } from "./shared/status-band/status-band.module";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  standalone: true,
  imports: [ShellModule, StatusBandModule],
})
export class AppComponent {
  private router = inject(Router);
  private sidebarService = inject(SidebarService);
  private startupWarm = inject(StartupWarmService);

  title = "frontend";
  sidebarCollapsed = false;

  constructor() {
    this.startupWarm.warm();
  }

  sidebarToggle() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.sidebarService.setCollapsed(this.sidebarCollapsed);
  }

  onNavigate(path: string) {
    this.router.navigate([path]);
  }
}

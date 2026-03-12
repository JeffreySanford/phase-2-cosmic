import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { SidebarService } from "./base/sidebar/sidebar.service";
import { StartupWarmService } from "./services/startup-warm.service";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  standalone: false,
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

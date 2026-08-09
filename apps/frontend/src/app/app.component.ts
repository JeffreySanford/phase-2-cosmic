import { AsyncPipe } from "@angular/common";
import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { SidebarService } from "./base/sidebar/sidebar.service";
import { StartupWarmService } from "./services/startup-warm.service";
import { IngestEventStreamService } from "./services/ingest-event-stream.service";
import { ShellModule } from "./base/shell.module";
import { StatusBandModule } from "./shared/status-band/status-band.module";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  standalone: true,
  imports: [AsyncPipe, ShellModule, StatusBandModule],
})
export class AppComponent {
  private router = inject(Router);
  private sidebarService = inject(SidebarService);
  private startupWarm = inject(StartupWarmService);
  private ingestEventStream = inject(IngestEventStreamService);

  readonly ingestEvents$ = this.ingestEventStream.events$;

  title = "frontend";
  sidebarCollapsed = false;

  constructor() {
    this.startupWarm.warm();
    // Activate the repaired event path at the application boundary. The stream
    // service guards SSR/non-browser execution, so this becomes a real Angular
    // runtime subscription when the application hydrates in the browser:
    // Kafka -> java-ingest -> API -> SSE -> Angular.
    this.ingestEventStream.connect();
  }

  sidebarToggle() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.sidebarService.setCollapsed(this.sidebarCollapsed);
  }

  onNavigate(path: string) {
    this.router.navigate([path]);
  }
}

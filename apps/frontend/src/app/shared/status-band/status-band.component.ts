import { Component, OnInit, OnDestroy, inject } from "@angular/core";
import {
  SystemStatusService,
  SystemStatus,
} from "../../services/system-status.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { Subscription } from "rxjs";

/**
 * App-level status/freshness band component.
 * Displays system health and data freshness indicators.
 *
 * Phase 1B deliverable: app-level status/freshness band.
 * See: docuentation/ROADMAP.md#phase-1b-frontend-orchestration-baseline
 */
@Component({
  selector: "app-status-band",

  templateUrl: "./status-band.component.html",
  styles: [
    `
      .status-band {
        width: 100%;
        padding: 0.5rem 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        transition: all 0.3s ease;
        border-bottom: 1px solid rgba(0, 0, 0, 0.12);
      }

      .status-band--healthy {
        background: #e8f5e9;
        color: #2e7d32;
      }

      .status-band--degraded {
        background: #fff3e0;
        color: #e65100;
      }

      .status-band--offline {
        background: #ffebee;
        color: #c62828;
      }

      .status-band__content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        max-width: 1200px;
        width: 100%;
      }

      .status-band__icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      .status-band__message {
        font-weight: 500;
      }

      .status-band__timestamp {
        font-size: 11px;
        opacity: 0.8;
        margin-left: auto;
      }

      .status-band__services {
        display: flex;
        gap: 0.5rem;
      }

      .status-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .status-badge--offline {
        background: rgba(198, 40, 40, 0.2);
      }

      .status-badge--stress {
        background: rgba(255, 193, 7, 0.2);
        color: #795548;
      }
    `,
  ],
  standalone: false,
})
export class StatusBandComponent implements OnInit, OnDestroy {
  private statusService = inject(SystemStatusService);
  private loadProfile = inject(LoadProfileService);

  status: SystemStatus = {
    health: "healthy",
    lastCheck: new Date(),
    services: {
      governance: "online",
      telemetry: "online",
      diagnostics: "online",
    },
  };

  stressActive = false;
  stressModeLabel = "";
  profilePct: number | null = null;
  workerCount: number | null = null;
  profileNote = "";

  shouldShow = true;
  private subscription?: Subscription;
  private stressSubscription?: Subscription;
  private modeSubscription?: Subscription;
  private profileSubscription?: Subscription;
  private workerSubscription?: Subscription;
  private noteSubscription?: Subscription;
  timestampDisplay = "";

  ngOnInit(): void {
    this.subscription = this.statusService.status$.subscribe((status) => {
      this.status = status;
      this.updateTimestampDisplay();
      this.shouldShow = true;
    });

    this.stressSubscription = this.loadProfile.stress$.subscribe((stress) => {
      this.stressActive = stress;
    });
    this.modeSubscription = this.loadProfile.mode$.subscribe((mode) => {
      this.stressModeLabel =
        mode === "runtime-controlled" ? "(stress load active)" : "";
    });
    this.profileSubscription = this.loadProfile.profile$.subscribe(
      (profile) => {
        this.profilePct = profile;
      }
    );
    this.workerSubscription = this.loadProfile.workers$.subscribe((workers) => {
      this.workerCount = workers;
    });
    this.noteSubscription = this.loadProfile.note$.subscribe((note) => {
      this.profileNote = note;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.stressSubscription?.unsubscribe();
    this.modeSubscription?.unsubscribe();
    this.profileSubscription?.unsubscribe();
    this.workerSubscription?.unsubscribe();
    this.noteSubscription?.unsubscribe();
  }

  getIcon(): string {
    switch (this.status.health) {
      case "healthy":
        return "check_circle";
      case "degraded":
        return "warning";
      case "offline":
        return "error";
      default:
        return "help";
    }
  }

  getMessage(): string {
    if (this.status.message) {
      return this.status.message;
    }
    switch (this.status.health) {
      case "healthy":
        return "All systems operational";
      case "degraded":
        return "Some services degraded";
      case "offline":
        return "System offline - check connection";
      default:
        return "Status unknown";
    }
  }

  getTimestamp(): string {
    const now = new Date();
    const diff = now.getTime() - this.status.lastCheck.getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  private updateTimestampDisplay(): void {
    this.timestampDisplay = this.getTimestamp();
  }
}

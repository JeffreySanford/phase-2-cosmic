import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTabsModule } from "@angular/material/tabs";
import {
  InfrastructureTelemetrySnapshot,
  AlertSloMetrics,
} from "../../shared/types";

@Component({
  selector: "app-infra-tabs",
  templateUrl: "./infra-tabs.component.html",
  styleUrls: ["./infra-tabs.component.scss"],
  standalone: true,
  imports: [CommonModule, MatTabsModule],
})
export class InfraTabsComponent {
  // parent ensures `infra` is non-null when the component is instantiated
  @Input() infra!: InfrastructureTelemetrySnapshot;
  @Input() alertSlo: AlertSloMetrics | null = null;
  @Input() alertSloError: string | null = null;

  // formatting utilities copied from TelemetryComponent
  formatBytesPerSec(value?: number): string {
    return this.humanRate(Number(value ?? 0));
  }

  formatRequestsPerSec(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)} req/s`;
  }

  formatOpsPerSec(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)} ops/s`;
  }

  formatCount(value?: number): string {
    return new Intl.NumberFormat().format(Math.round(Number(value ?? 0)));
  }

  formatMs(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)} ms`;
  }

  formatPercent(value?: number): string {
    return `${Number(value ?? 0).toFixed(2)}%`;
  }

  formatCurrentValue(value?: number): string {
    // replicate same helper if needed, already in parent component
    if (value == null) return "n/a";
    return `${value}`;
  }

  infraSourceLabel(source?: string): string {
    if (source === "prometheus") return "Live";
    if (source === "admin") return "Live (Admin API)";
    if (source === "mock") return "Mock";
    return "Unavailable";
  }

  // humanRate from TelemetryComponent:
  private humanRate(v: number): string {
    if (v === 0) return "0 B/s";
    const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(2)} ${units[i]}`;
  }
}

import { Component, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

export interface TopologyNodeDialogData {
  type: "node";
  id: string;
  label?: string;
  group?: string;
  description?: string;
}

export interface TopologyLinkStats {
  throughput?: number | string; // MB/s or human-readable
  throughputPct?: string; // e.g. "82%"
  latencyMs?: number;
  errorRate?: number | string; // percentage or fraction or string
  confidencePct?: number;
  source?: "prometheus" | "admin" | "derived" | "mock" | "unavailable";
  measurementPath?: string;
}

export interface TopologyLinkDialogData {
  type: "link";
  source: string;
  target: string;
  value?: number;
  stats?: TopologyLinkStats;
}

export type TopologyInfoDialogData =
  | TopologyNodeDialogData
  | TopologyLinkDialogData;

@Component({
  selector: "app-topology-info-dialog",
  templateUrl: "./topology-info-dialog.component.html",
})
export class TopologyInfoDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<TopologyInfoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TopologyInfoDialogData
  ) {}

  close(): void {
    this.dialogRef.close();
  }

  private parsePct(s: string | undefined): number | undefined {
    if (!s) return undefined;
    const n = Number(s.replace("%", "").trim());
    return Number.isFinite(n) ? n : undefined;
  }

  isCritical(): boolean {
    if (this.data.type !== "link") return false;
    const p = this.parsePct(this.data.stats?.throughputPct);
    return p !== undefined && p >= 95;
  }

  isHighUtil(): boolean {
    if (this.data.type !== "link") return false;
    const p = this.parsePct(this.data.stats?.throughputPct);
    return p !== undefined && p >= 75 && p < 95;
  }

  isNormalUtil(): boolean {
    if (this.data.type !== "link") return false;
    const p = this.parsePct(this.data.stats?.throughputPct);
    return p !== undefined && p < 75;
  }

  sourceLabel(): string {
    if (this.data.type !== "link") return "";
    switch (this.data.stats?.source) {
      case "prometheus":
        return "Live exporter metrics";
      case "admin":
        return "Live admin API";
      case "mock":
        return "Mock telemetry";
      case "unavailable":
        return "Unavailable";
      default:
        return "Derived model";
    }
  }

  confidenceLabel(): string {
    if (this.data.type !== "link") return "";
    const score = Number(this.data.stats?.confidencePct ?? NaN);
    if (!Number.isFinite(score)) return "Unknown";
    if (score >= 90) return "High confidence";
    if (score >= 70) return "Good confidence";
    if (score >= 40) return "Moderate confidence";
    if (score > 0) return "Low confidence";
    return "Unavailable";
  }

  measurementPathLabel(): string {
    if (this.data.type !== "link") return "";
    const path = this.data.stats?.measurementPath;
    if (!path) return "";
    switch (path) {
      case "direct-prometheus":
        return "Direct Prometheus query";
      case "direct-prometheus+infrastructure-fallback":
        return "Prometheus (infrastructure fallback)";
      case "infrastructure-snapshot":
        return "Infrastructure snapshot";
      case "derived-model":
        return "Derived model";
      default:
        return path;
    }
  }
}

import { Component, inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

export interface TopologyNodeDialogData {
  type: "node";
  id: string;
  label?: string;
  group?: string;
  description?: string;
}

/** Evidence state for one link. Mirrors the server-side resolver. */
export type TopologyLinkEvidenceState =
  | "measured"
  | "stale"
  | "derived"
  | "declared"
  | "mock";

export interface TopologyLinkStats {
  throughput?: number | string; // MB/s or human-readable
  throughputPct?: string; // e.g. "82%"
  latencyMs?: number;
  errorRate?: number | string; // percentage or fraction or string
  /** Null/absent means nothing measured this link. Never defaulted to a grade. */
  confidencePct?: number | null;
  state?: TopologyLinkEvidenceState;
  /** Prometheus series backing the value, so a reader can verify it. */
  measurementSource?: string | null;
  measuredAt?: number | null;
  source?:
    | "prometheus"
    | "admin"
    | "derived"
    | "mock"
    | "unavailable"
    | "declared"
    | "measured"
    | "stale";
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
  standalone: false,
})
export class TopologyInfoDialogComponent {
  dialogRef = inject<MatDialogRef<TopologyInfoDialogComponent>>(MatDialogRef);
  data = inject<TopologyInfoDialogData>(MAT_DIALOG_DATA);

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

  /**
   * Evidence state drives the label, not the number.
   *
   * A missing confidence value means nothing measured this link, and that is
   * reported as absence. It must never fall through to a confidence grade.
   */
  confidenceLabel(): string {
    if (this.data.type !== "link") return "";

    const state = this.data.stats?.state;
    if (state === "declared") return "No measurement";
    if (state === "mock") return "Mock data";
    if (state === "stale") return "Stale measurement";
    if (state === "derived") return "Derived measurement";

    const score = Number(this.data.stats?.confidencePct ?? NaN);
    if (!Number.isFinite(score)) return "No measurement";
    if (score >= 90) return "Measured";
    if (score >= 70) return "Derived measurement";
    if (score >= 40) return "Stale measurement";
    return "No measurement";
  }

  /** The Prometheus series behind the number, so a reader can verify it. */
  measurementSourceLabel(): string {
    if (this.data.type !== "link") return "";
    return this.data.stats?.measurementSource ?? "none";
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

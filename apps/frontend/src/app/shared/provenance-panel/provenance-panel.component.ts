import { Component, Input } from "@angular/core";

export interface ProvenanceInfo {
  workflow?: string;
  jobId?: string;
  sourceDatasetId?: string;
  processingTimestamp?: string;
  parameters?: Record<string, unknown>;
  audit?: AuditEvidence;
  ngvlaParams?: {
    arraySegment?: string;
    antennaClass?: string;
    frequencyBandGHz?: { min: number; max: number };
  };
}

export interface AuditEvidence {
  action?: string;
  actor?: string;
  timestamp?: string;
  requestId?: string;
  correlationId?: string;
  policyDecision?: string;
}

/**
 * Dataset Provenance Linkage Panel Component
 *
 * Displays provenance information linking datasets to their originating
 * workflows, jobs, and processing parameters for scientific reproducibility.
 *
 * Mission linkage:
 * - Mission outcome: Reproducible science
 * - Operator/science impact: Complete provenance enables workflow traceability and validation
 * - Validation evidence: Provenance metadata displayed in dataset views
 */
@Component({
  selector: "app-provenance-panel",
  templateUrl: "./provenance-panel.component.html",
  styleUrls: ["./provenance-panel.component.scss"],
  standalone: false,
})
export class ProvenancePanelComponent {
  @Input() provenance?: ProvenanceInfo;
  @Input() datasetId?: string;

  expanded = false;

  get hasProvenance(): boolean {
    return !!(this.provenance?.workflow || this.provenance?.jobId);
  }

  get hasNgvlaParams(): boolean {
    return !!this.provenance?.ngvlaParams?.arraySegment;
  }

  get hasAuditEvidence(): boolean {
    const audit = this.provenance?.audit;
    return !!(
      audit?.action ||
      audit?.actor ||
      audit?.requestId ||
      audit?.correlationId ||
      audit?.policyDecision
    );
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  formatFrequencyRange(range?: { min: number; max: number }): string {
    if (!range) return "N/A";
    return `${range.min} - ${range.max} GHz`;
  }

  formatParameters(params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) return "None";
    return JSON.stringify(params, null, 2);
  }
}

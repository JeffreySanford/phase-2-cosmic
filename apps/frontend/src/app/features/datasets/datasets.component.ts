import { Component, OnInit, inject } from "@angular/core";
import {
  DatasetsService,
  Dataset,
  DatasetRequest,
} from "../../services/datasets.service";
import { AuditEvidence, ProvenanceInfo } from "../../shared/provenance-panel";

@Component({
  selector: "app-datasets",
  templateUrl: "./datasets.component.html",
  styleUrls: ["./datasets.component.scss"],
  standalone: false,
})
export class DatasetsComponent implements OnInit {
  private ds = inject(DatasetsService);

  datasets: Dataset[] = [];
  name = "";
  description = "";
  error: string | null = null;
  initialLoadSettled = false;

  ngOnInit(): void {
    this.reload();
  }

  reload() {
    this.ds.list().subscribe(
      (list) => {
        this.datasets = list || [];
        this.initialLoadSettled = true;
      },
      (e) => {
        this.error = this.errMsg(e);
        this.initialLoadSettled = true;
      }
    );
  }

  create() {
    const req: DatasetRequest = {
      name: this.name,
      description: this.description,
    };
    this.ds.create(req).subscribe(
      (d) => {
        this.datasets = [d, ...this.datasets];
        this.name = "";
        this.description = "";
      },
      (e) => (this.error = this.errMsg(e))
    );
  }

  externalSourcesFor(dataset: Dataset): unknown[] {
    const topLevel = (dataset as unknown as Record<string, unknown>)[
      "sourceAttribution"
    ];
    const manifest = dataset.manifest?.["sourceAttribution"];
    const metadata = dataset.metadata?.["sourceAttribution"];
    return [topLevel, manifest, metadata].filter(
      (value): value is unknown => value !== null && value !== undefined
    );
  }

  provenanceFor(dataset: Dataset): ProvenanceInfo {
    return {
      workflow: dataset.workflow,
      jobId: dataset.jobId,
      sourceDatasetId: dataset.sourceDatasetId,
      processingTimestamp: dataset.processingTimestamp,
      parameters: dataset.parameters,
      ngvlaParams: dataset.ngvlaParams,
      audit: this.auditEvidenceFor(dataset),
    };
  }

  private auditEvidenceFor(dataset: Dataset): AuditEvidence | undefined {
    const candidates = [
      dataset.metadata?.["audit"],
      dataset.metadata?.["auditContext"],
      dataset.manifest?.["audit"],
      dataset.manifest?.["auditContext"],
    ];
    const found = candidates.find(
      (candidate): candidate is Record<string, unknown> =>
        !!candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
    );
    if (!found) {
      return undefined;
    }
    return {
      action: this.stringValue(found["action"]),
      actor: this.stringValue(found["actor"]),
      timestamp: this.stringValue(found["timestamp"]),
      requestId: this.stringValue(found["requestId"]),
      correlationId: this.stringValue(found["correlationId"]),
      policyDecision: this.stringValue(found["policyDecision"]),
    };
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private errMsg(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message ?? err);
    }
    return String(err);
  }
}

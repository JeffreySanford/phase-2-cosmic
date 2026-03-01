import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { JobsService } from '../../services/jobs.service';

export interface JobsSubmitData {
  workflow?: string;
  parameters?: Record<string, unknown> | undefined;
}

@Component({
  selector: 'app-jobs-submit-dialog',
  templateUrl: './jobs-submit-dialog.component.html',
})
export class JobsSubmitDialogComponent implements OnInit {
  workflow = 'import';
  payloadText = '';
  datasetId = '';
  requestedBy = '';
  error: string | null = null;
  availableTypes: string[] = ['import', 'export', 'reindex', 'cleanup', 'diagnostics', 'custom'];

  // simple required field rules per type for client-side validation
  private requiredFields: Record<string, string[]> = {
    import: ['source'],
    ingest: ['source'],
    export: ['destination'],
    reindex: ['indexName'],
    cleanup: ['olderThanDays'],
    diagnostics: [],
    transform: ['script'],
    validate: ['rules'],
    archive: ['target'],
    snapshot: ['snapshotName'],
    analyze: ['query'],
    train: ['modelName'],
    notify: ['channel'],
    backup: ['target'],
    restore: ['source'],
    publish: ['destination'],
    fetch: ['uri'],
    scheduler: ['cron']
  };

  constructor(
    public dialogRef: MatDialogRef<JobsSubmitDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: JobsSubmitData,
    private jobsSvc: JobsService
  ) {
    this.workflow = data?.workflow || 'import';
    this.payloadText = data?.parameters ? JSON.stringify(data.parameters, null, 2) : '';
    this.datasetId = '';
    this.requestedBy = '';
  }

  ngOnInit(): void {
    // fetch types from backend (fallback to built-in list)
    this.jobsSvc.types().subscribe(
      (list) => {
        if (Array.isArray(list) && list.length) this.availableTypes = list;
        if (!this.payloadText && this.workflow !== 'custom') this.generateSample();
      },
      () => {
        if (!this.payloadText && this.workflow !== 'custom') this.generateSample();
      }
    );
  }

  cancel() {
    this.dialogRef.close(null);
  }

  submit() {
    try {
      const raw: unknown = this.payloadText ? JSON.parse(this.payloadText) : undefined;
      const parameters = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
      // client-side validation: ensure required fields exist for the selected workflow
      const required = this.requiredFields[this.workflow] || [];
      for (const key of required) {
        if (!parameters || !(key in parameters)) {
          this.error = `Missing required field for workflow '${this.workflow}': ${key}`;
          return;
        }
      }
      this.dialogRef.close({ workflow: this.workflow, datasetId: this.datasetId, parameters, requestedBy: this.requestedBy });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'message' in e) {
        this.error = String((e as { message?: unknown }).message ?? e);
      } else {
        this.error = String(e);
      }
    }
  }

  onTypeChange(newType: string) {
    this.workflow = newType;
    if (newType !== 'custom') {
      this.generateSample();
    }
  }

  generateSample() {
    const sample = this.sampleForType(this.workflow);
    if (sample) {
      this.payloadText = JSON.stringify(sample, null, 2);
      this.error = null;
    }
  }

  private sampleForType(t: string): Record<string, unknown> {
    switch (t) {
      case 'import':
        return { source: 's3://bucket/path', format: 'ndjson', options: { dedupe: true } };
      case 'export':
        return { destination: 's3://bucket/out', query: "select * from dataset where ds='x'" };
      case 'reindex':
        return { indexName: 'records-2026', batchSize: 5000 };
      case 'cleanup':
        return { olderThanDays: 90, dryRun: true };
      case 'diagnostics':
        return { runIperf: false, collectSystemSpecs: true };
      default:
        return { note: 'custom payload' };
    }
  }
}

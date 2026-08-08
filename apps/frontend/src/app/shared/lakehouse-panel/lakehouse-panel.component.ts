import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { type LakehouseMetricsSummary } from "../../services/lakehouse-metrics.service";

@Component({
  selector: "app-lakehouse-panel",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="lakehouse-panel" aria-label="Lakehouse panel">
      <div class="lakehouse-pill">{{ summary.source === 'live' ? 'Live' : 'Sample' }} mode</div>
      <p><strong>Bronze:</strong> {{ summary.bronzeState }} ({{ summary.bronzePercent ?? 0 }}%)</p>
      <p><strong>Silver quality:</strong> {{ summary.silverQuality }} ({{ summary.silverPercent ?? 0 }}%)</p>
      <p><strong>Gold readiness:</strong> {{ summary.goldReadiness }} ({{ summary.goldPercent ?? 0 }}%)</p>
      <p><strong>Failure rate:</strong> {{ summary.qualityFailureRate ?? 0 }}%</p>
      <p><strong>Transfer estimate:</strong> {{ summary.transferTimeEstimate ?? 'n/a' }}</p>
      <p class="tile-source">evidence: {{ summary.evidence }}</p>
      <p class="tile-source" *ngIf="summary.upstream">
        upstream: {{ summary.upstream.kind }} · {{ summary.upstream.endpoint }}
      </p>
      <p class="tile-source" *ngIf="summary.freshness">
        freshness: {{ summary.freshness.stale ? 'stale' : 'fresh' }} · {{ summary.freshness.lastUpdatedAt || 'n/a' }}
        <span *ngIf="summary.freshness.stale">· Needs refresh</span>
      </p>
    </section>
  `,
})
export class LakehousePanelComponent {
  @Input() summary!: LakehouseMetricsSummary;
}

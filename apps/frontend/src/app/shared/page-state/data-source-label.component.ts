import { Component, Input } from "@angular/core";
import { DataSource } from "./page-state.model";

/**
 * Data source label component to show data confidence level.
 *
 * Mission linkage:
 * - Mission outcome: Human decision speed
 * - Operator/science impact: Operators can immediately judge confidence level of displayed signals
 * - Validation evidence: Source labels present on all data-driven pages
 */
@Component({
  selector: "app-data-source-label",
  standalone: false,
  templateUrl: "./data-source-label.component.html",
  styles: [
    `
      .data-source-label {
        display: inline-flex;
      }

      .data-source-label__chip--live {
        background: #4caf50 !important;
        color: white !important;
      }

      .data-source-label__chip--fallback {
        background: #ff9800 !important;
        color: white !important;
      }

      .data-source-label__chip--mock {
        background: #9c27b0 !important;
        color: white !important;
      }

      .data-source-label__chip--stale {
        background: #f44336 !important;
        color: white !important;
      }

      .data-source-label__text {
        font-weight: 600;
        font-size: 11px;
        letter-spacing: 0.5px;
      }

      .data-source-label__timestamp {
        margin-left: 0.5rem;
        font-size: 10px;
        opacity: 0.9;
      }
    `,
  ],
})
export class DataSourceLabelComponent {
  @Input() source!: DataSource;

  formatTimestamp(ts: string): string {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);

      if (diffSec < 60) return `${diffSec}s ago`;
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  }
}

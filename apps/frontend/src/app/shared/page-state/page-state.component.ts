import { Component, Input } from "@angular/core";
import { PageStateConfig } from "./page-state.model";

/**
 * Shared page-state component for consistent UX primitives.
 *
 * Mission linkage:
 * - Mission outcome: Human decision speed
 * - Operator/science impact: Clear visual feedback for all page states
 * - Validation evidence: Component usage across Jobs, Datasets, Diagnostics
 */
@Component({
  selector: "app-page-state",
  standalone: false,
  templateUrl: "./page-state.component.html",
  styles: [
    `
      .page-state {
        width: 100%;
        padding: 2rem;
      }

      .page-state__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        min-height: 200px;
      }

      .page-state__banner {
        min-height: auto;
        padding: 1rem;
        background: rgba(255, 193, 7, 0.1);
        border-left: 4px solid #ffc107;
        border-radius: 4px;
        flex-direction: row;
        justify-content: flex-start;
      }

      .page-state__banner--success {
        background: rgba(76, 175, 80, 0.1);
        border-left-color: #4caf50;
      }

      .page-state__icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: rgba(0, 0, 0, 0.54);
      }

      .page-state__banner .page-state__icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .page-state__icon--error {
        color: #f44336;
      }

      .page-state__message {
        margin: 0;
        text-align: center;
        color: rgba(0, 0, 0, 0.87);
        font-size: 14px;
      }

      .page-state__banner .page-state__message {
        flex: 1;
        text-align: left;
      }
    `,
  ],
})
export class PageStateComponent {
  @Input() config!: PageStateConfig;
}

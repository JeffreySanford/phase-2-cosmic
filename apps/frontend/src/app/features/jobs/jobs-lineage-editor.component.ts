import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
} from "@angular/core";

interface Entry {
  key: string;
  value: string;
}

@Component({
  selector: "app-jobs-lineage-editor",
  templateUrl: "./jobs-lineage-editor.component.html",
  styles: [
    `
      .lineage-list {
        width: 100%;
        font-family: monospace;
      }
      .row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 4px;
      }
      input {
        flex: 1;
      }
    `,
  ],
})
export class JobsLineageEditorComponent implements OnChanges {
  @Input() lineage: Record<string, unknown> | undefined;
  @Output() lineageChange = new EventEmitter<
    Record<string, unknown> | undefined
  >();

  entries: Entry[] = [];

  ngOnChanges(): void {
    if (this.lineage) {
      this.entries = Object.entries(this.lineage).map(([k, v]) => ({
        key: k,
        value: String(v),
      }));
    } else {
      this.entries = [];
    }
  }

  private emitChange(): void {
    if (this.entries.length === 0) {
      this.lineageChange.emit(undefined);
      return;
    }
    const obj: Record<string, unknown> = {};
    for (const e of this.entries) {
      if (e.key) obj[e.key] = e.value;
    }
    this.lineageChange.emit(obj);
  }

  add(): void {
    this.entries.push({ key: "", value: "" });
    this.emitChange();
  }

  remove(idx: number): void {
    this.entries.splice(idx, 1);
    this.emitChange();
  }
}

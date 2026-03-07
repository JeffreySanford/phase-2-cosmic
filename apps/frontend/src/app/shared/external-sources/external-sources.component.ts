import { Component, Input } from "@angular/core";

type SourceRow = Record<string, string | number | boolean | null | undefined>;
type ExternalSource = {
  provider?: string;
  sourceName?: string;
  name?: string;
  citationUrl?: string;
  accessUrl?: string;
  tapUrl?: string;
  sampleFields?: string[];
  sampleRows?: SourceRow[];
  links?: string[];
};

@Component({
  selector: "app-external-sources",
  templateUrl: "./external-sources.component.html",
  styleUrls: ["./external-sources.component.scss"],
})
export class ExternalSourcesComponent {
  @Input() sources: unknown[] | undefined;
  @Input() compact = true;

  get hasSources(): boolean {
    return Array.isArray(this.sources) && this.sources.length > 0;
  }

  fieldsFor(source: unknown): string[] {
    const normalized = this.asSource(source);
    if (!normalized) return [];
    if (
      Array.isArray(normalized.sampleFields) &&
      normalized.sampleFields.length > 0
    ) {
      return normalized.sampleFields;
    }
    const firstRow = normalized.sampleRows?.[0];
    return firstRow ? Object.keys(firstRow) : [];
  }

  displayValue(row: SourceRow, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? "" : String(value);
  }

  asSource(source: unknown): ExternalSource | null {
    if (!source || typeof source !== "object") return null;
    return source as ExternalSource;
  }

  private sourceRows(source: unknown): SourceRow[] {
    const normalized = this.asSource(source);
    return Array.isArray(normalized?.sampleRows) ? normalized.sampleRows : [];
  }

  rowsFor(source: unknown): SourceRow[] {
    return this.sourceRows(source).slice(0, 5);
  }

  linksFor(source: unknown): string[] {
    const normalized = this.asSource(source);
    return Array.isArray(normalized?.links) ? normalized.links : [];
  }

  titleFor(source: unknown): string {
    const normalized = this.asSource(source);
    return (
      normalized?.provider || normalized?.sourceName || normalized?.name || ""
    );
  }

  urlFor(source: unknown): string {
    const normalized = this.asSource(source);
    return (
      normalized?.citationUrl ||
      normalized?.accessUrl ||
      normalized?.tapUrl ||
      ""
    );
  }
}

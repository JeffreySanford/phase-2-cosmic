import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface DiagnosticsIndex {
  path: string;
  files: string[];
}

@Component({
  selector: 'app-diagnostics',
  templateUrl: './diagnostics.component.html',
  styleUrls: ['./diagnostics.component.scss'],
})
export class DiagnosticsComponent implements OnInit {
  index: DiagnosticsIndex | null = null;
  loading = false;
  error: string | null = null;
  systemSpecs: string | null = null;
  visibleFileCount = 5;
  readonly fileCountOptions: number[] = [5, 10, 25, 50, 100, -1];
  sortedFiles: string[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchIndex();
  }

  fetchIndex() {
    this.loading = true;
    this.error = null;
    this.http.get<DiagnosticsIndex>('/api/diagnostics').subscribe(
      (res) => {
        this.index = res;
        this.sortedFiles = this.sortFilesByRecency(res.files);
        this.loading = false;
      },
      (err) => {
        this.error = String(err?.message || err);
        this.loading = false;
      }
    );
  }

  viewSystemSpecs() {
    this.loading = true;
    this.systemSpecs = null;
    this.http.get('/api/diagnostics/system-specs', { responseType: 'text' }).subscribe(
      (txt) => {
        this.systemSpecs = txt;
        this.loading = false;
      },
      (err) => {
        this.error = String(err?.message || err);
        this.loading = false;
      }
    );
  }

  get visibleFiles(): string[] {
    if (this.visibleFileCount < 0) return this.sortedFiles;
    return this.sortedFiles.slice(0, this.visibleFileCount);
  }

  setVisibleFileCount(count: number): void {
    this.visibleFileCount = Number(count);
  }

  private sortFilesByRecency(files: string[]): string[] {
    const filtered = (files || []).filter((f) => f !== '.gitkeep');
    return filtered.slice().sort((a, b) => {
      const at = this.extractTimestamp(a);
      const bt = this.extractTimestamp(b);
      if (bt !== at) return bt - at;
      return b.localeCompare(a);
    });
  }

  private extractTimestamp(fileName: string): number {
    const m = fileName.match(/\.(\d{8}T\d{6}Z)$/);
    if (!m?.[1]) return 0;
    const raw = m[1];
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

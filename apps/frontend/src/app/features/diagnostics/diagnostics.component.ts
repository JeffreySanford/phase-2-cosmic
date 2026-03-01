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
}

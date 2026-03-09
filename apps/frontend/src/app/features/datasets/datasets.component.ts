import { Component, OnInit } from "@angular/core";
import {
  DatasetsService,
  Dataset,
  DatasetRequest,
} from "../../services/datasets.service";

@Component({
    selector: "app-datasets",
    templateUrl: "./datasets.component.html",
    styleUrls: ["./datasets.component.scss"],
    standalone: false
})
export class DatasetsComponent implements OnInit {
  datasets: Dataset[] = [];
  name = "";
  description = "";
  error: string | null = null;
  initialLoadSettled = false;

  constructor(private ds: DatasetsService) {}

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

  private errMsg(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message ?? err);
    }
    return String(err);
  }
}

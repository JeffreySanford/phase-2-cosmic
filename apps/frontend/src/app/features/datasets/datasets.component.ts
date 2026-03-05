import { Component, OnInit } from "@angular/core";
import {
  DatasetsService,
  Dataset,
  DatasetRequest,
} from "../../services/datasets.service";

@Component({
  selector: "app-datasets",
  templateUrl: "./datasets.component.html",
  styleUrls: [],
})
export class DatasetsComponent implements OnInit {
  datasets: Dataset[] = [];
  name = "";
  description = "";
  error: string | null = null;

  constructor(private ds: DatasetsService) {}

  ngOnInit(): void {
    this.reload();
  }

  reload() {
    this.ds.list().subscribe(
      (list) => (this.datasets = list || []),
      (e) => (this.error = this.errMsg(e))
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

  private errMsg(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message ?? err);
    }
    return String(err);
  }
}

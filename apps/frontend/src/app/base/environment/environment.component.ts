import { Component, OnInit, inject } from "@angular/core";
import { EnvironmentService, AppEnv } from "./environment.service";

@Component({
  selector: "app-environment",
  templateUrl: "./environment.component.html",
  styles: [
    `
      .env {
        font-family: monospace;
        font-size: 0.9rem;
      }
    `,
  ],
  standalone: false,
})
export class EnvironmentComponent implements OnInit {
  private envService = inject(EnvironmentService);

  env: AppEnv | null = null;

  ngOnInit(): void {
    this.envService.load().subscribe((v) => (this.env = v));
  }
}

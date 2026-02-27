import { Component, OnInit } from '@angular/core';
import { EnvironmentService, AppEnv } from './environment.service';

@Component({
  selector: 'app-environment',
  templateUrl: './environment.component.html',
  styles: [
    `
      .env { font-family: monospace; font-size: 0.9rem; }
    `,
  ],
})
export class EnvironmentComponent implements OnInit {
  env: AppEnv | null = null;

  constructor(private envService: EnvironmentService) {}

  ngOnInit(): void {
    this.envService.load().subscribe((v) => (this.env = v));
  }
}

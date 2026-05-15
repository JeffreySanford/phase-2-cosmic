import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

export interface AppEnv {
  NODE_ENV?: string;
  PORT?: string;
  FRONTEND_PORT?: string;
  MINIO_ROOT_USER?: string;
  PNPM_STORE_DIR?: string;
  KAFKA_BROKER?: string;
  RABBITMQ_URL?: string;
  GRAFANA_DASHBOARD_URL?: string;
  GRAFANA_DASHBOARD_ENABLED?: string;
  GRAFANA_DASHBOARD_ACCESS_MODE?: string;
  GRAFANA_DASHBOARD_EMBED_MODE?: string;
}

@Injectable({ providedIn: "root" })
export class EnvironmentService {
  private http = inject(HttpClient);

  load(): Observable<AppEnv> {
    return this.http.get<AppEnv>("/api/env");
  }
}

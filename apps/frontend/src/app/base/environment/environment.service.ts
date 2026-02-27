import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AppEnv {
  NODE_ENV?: string;
  PORT?: string;
  FRONTEND_PORT?: string;
  MINIO_ROOT_USER?: string;
  PNPM_STORE_DIR?: string;
  KAFKA_BROKER?: string;
  RABBITMQ_URL?: string;
}

@Injectable({ providedIn: 'root' })
export class EnvironmentService {
  constructor(private http: HttpClient) {}

  load(): Observable<AppEnv> {
    return this.http.get<AppEnv>('/api/env');
  }
}

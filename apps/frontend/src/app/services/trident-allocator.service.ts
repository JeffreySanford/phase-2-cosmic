import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

import {
  FspAllocationPlan,
  FspAllocation,
  SchedulingBlock,
  SpectralConfiguration,
} from "../shared/trident.types";

export interface AllocateRequest {
  schedulingBlock: SchedulingBlock;
  spectralConfig?: SpectralConfiguration;
  /** Previously committed allocations used for contention/capacity checks. */
  existingAllocations?: FspAllocation[];
}

export interface AllocateError {
  code:
    | "CONTENTION"
    | "CAPACITY_EXHAUSTED"
    | "INVALID_SPECTRAL"
    | "BAD_REQUEST";
  message: string;
  conflicts?: string[];
}

@Injectable({ providedIn: "root" })
export class TridentAllocatorService {
  private http = inject(HttpClient);

  /** Base URL of the simulator; override for non-default ports / environments. */
  allocatorBase = "http://localhost:7777";

  allocate(req: AllocateRequest): Observable<FspAllocationPlan> {
    return this.http
      .post<FspAllocationPlan>(`${this.allocatorBase}/allocate`, req)
      .pipe(
        catchError((err: HttpErrorResponse) =>
          throwError(() => err.error as AllocateError)
        )
      );
  }

  health(): Observable<{ status: string; service: string }> {
    return this.http.get<{ status: string; service: string }>(
      `${this.allocatorBase}/health`
    );
  }
}

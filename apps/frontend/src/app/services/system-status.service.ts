import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { catchError, tap } from 'rxjs/operators';

export interface SystemStatus {
  health: 'healthy' | 'degraded' | 'offline';
  lastCheck: Date;
  message?: string;
  services: {
    governance: 'online' | 'offline';
    streaming: 'online' | 'offline';
  };
}

/**
 * App-level status service for monitoring system health and data freshness.
 * 
 * Mission linkage:
 * - Mission outcome: Human decision speed
 * - Operator/science impact: Operators see immediate system status feedback
 * - Validation evidence: Status band visible across all routes
 */
@Injectable({
  providedIn: 'root'
})
export class SystemStatusService {
  private statusSubject = new BehaviorSubject<SystemStatus>({
    health: 'healthy',
    lastCheck: new Date(),
    services: {
      governance: 'online',
      streaming: 'online'
    }
  });

  public status$: Observable<SystemStatus> = this.statusSubject.asObservable();

  constructor(private http: HttpClient) {
    // Check health every 30 seconds
    interval(30000).subscribe(() => this.checkHealth());
    // Initial check
    this.checkHealth();
  }

  private checkHealth(): void {
    this.http.get('/api/v1/health', { observe: 'response' }).pipe(
      tap(response => {
        const newStatus: SystemStatus = {
          health: 'healthy',
          lastCheck: new Date(),
          services: {
            governance: response.status === 200 ? 'online' : 'offline',
            streaming: 'online' // TODO: Add streaming health check
          }
        };
        this.statusSubject.next(newStatus);
      }),
      catchError(() => {
        const newStatus: SystemStatus = {
          health: 'offline',
          lastCheck: new Date(),
          message: 'Governance API unavailable',
          services: {
            governance: 'offline',
            streaming: 'online'
          }
        };
        this.statusSubject.next(newStatus);
        return of(null);
      })
    ).subscribe();
  }

  public forceCheck(): void {
    this.checkHealth();
  }

  public getCurrentStatus(): SystemStatus {
    return this.statusSubject.value;
  }
}

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type DataMode = 'live' | 'mock';

@Injectable({ providedIn: 'root' })
export class DataSourceService {
  private modeSubject = new BehaviorSubject<DataMode>('live');
  readonly mode$ = this.modeSubject.asObservable();

  setMode(m: DataMode) {
    this.modeSubject.next(m);
  }

  get mode(): DataMode {
    return this.modeSubject.value;
  }
}

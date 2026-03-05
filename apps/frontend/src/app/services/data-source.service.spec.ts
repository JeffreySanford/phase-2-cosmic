import { TestBed } from '@angular/core/testing';
import { DataSourceService } from './data-source.service';

describe('DataSourceService', () => {
  let service: DataSourceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DataSourceService);
  });

  it('defaults to live mode and can switch to mock', (done) => {
    expect(service.mode).toBe('live');
    service.mode$.subscribe((m) => {
      if (m === 'mock') {
        expect(service.mode).toBe('mock');
        done();
      }
    });
    service.setMode('mock');
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TelemetryService]
    });
    service = TestBed.inject(TelemetryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    const loadProfileRequests = httpMock.match('/api/load-profile');
    loadProfileRequests.forEach((request) => request.flush({}));
    httpMock.verify();
  });

  it('should get Pulsar status successfully', (done) => {
    const mockPulsarStatus = {
      brokers: 1,
      topics: 5,
      partitions: 15,
      status: 'healthy',
      lastUpdated: '2026-03-05T12:00:00.000Z'
    };

    service.getPulsarStatus().subscribe(status => {
      expect(status.brokers).toBe(1);
      expect(status.topics).toBe(5);
      expect(status.partitions).toBe(15);
      expect(status.status).toBe('healthy');
      expect(status.lastUpdated).toBeDefined();
      done();
    });

    const req = httpMock.expectOne('/api/v1/pulsar/status');
    expect(req.request.method).toBe('GET');
    req.flush(mockPulsarStatus);
  });

  it('should handle Pulsar status error', (done) => {
    service.getPulsarStatus().subscribe({
      next: () => fail('Should have failed'),
      error: (error) => {
        expect(error).toBeDefined();
        done();
      }
    });

    const req = httpMock.expectOne('/api/v1/pulsar/status');
    req.flush('Service unavailable', { status: 503, statusText: 'Service Unavailable' });
  });
});

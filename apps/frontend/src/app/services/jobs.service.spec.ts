import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [JobsService]
    });
    service = TestBed.inject(JobsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should update lineage successfully', (done) => {
    const jobId = 'test-job-123';
    const lineage = { parentJobId: 'parent-456', grandparentJobId: 'grandparent-789' };

    service.updateLineage(jobId, lineage).subscribe(result => {
      expect(result).toBeDefined();
      done();
    });

    const req = httpMock.expectOne(`/api/v1/jobs/${jobId}/lineage`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(lineage);
    req.flush({ status: 'updated' });
  });

  it('should handle update lineage error', (done) => {
    const jobId = 'nonexistent-job';
    const lineage = { parentJobId: 'parent-123' };

    service.updateLineage(jobId, lineage).subscribe({
      next: () => fail('Should have failed'),
      error: (error) => {
        expect(error).toBeDefined();
        done();
      }
    });

    const req = httpMock.expectOne(`/api/v1/jobs/${jobId}/lineage`);
    req.flush('Not found', { status: 404, statusText: 'Not Found' });
  });
});
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component } from '@angular/core';
import { DiagnosticsComponent } from './diagnostics.component';

@Component({ selector: 'app-promql-card', template: '' })
class PromqlCardStubComponent {}
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MatButtonModule } from '@angular/material/button';

describe('DiagnosticsComponent', () => {
  let fixture: ComponentFixture<DiagnosticsComponent>;
  let comp: DiagnosticsComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, MatButtonModule],
      declarations: [DiagnosticsComponent, PromqlCardStubComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DiagnosticsComponent);
    comp = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('fetches index and system-specs', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('/api/diagnostics');
    req.flush({ path: '/tmp/logs', files: ['system-specs.txt'] });
    expect(comp.index).toBeTruthy();
    // request system-specs
    comp.viewSystemSpecs();
    const req2 = httpMock.expectOne('/api/diagnostics/system-specs');
    req2.flush('cpu: test');
    expect(comp.systemSpecs).toContain('cpu: test');
    httpMock.verify();
  });
});

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, Input } from '@angular/core';
import { DiagnosticsComponent } from './diagnostics.component';

@Component({ selector: 'app-promql-card', template: '' })
class PromqlCardStubComponent {}

@Component({ selector: 'app-disclaimer-banner', template: '' })
class DisclaimerBannerStubComponent {
  @Input() dismissible?: boolean;
  @Input() type?: string;
  @Input() message?: string;
}
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('DiagnosticsComponent', () => {
  let fixture: ComponentFixture<DiagnosticsComponent>;
  let comp: DiagnosticsComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, MatButtonModule, MatFormFieldModule, MatSelectModule, NoopAnimationsModule],
      declarations: [DiagnosticsComponent, PromqlCardStubComponent, DisclaimerBannerStubComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DiagnosticsComponent);
    comp = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('fetches index and system-specs', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('/api/diagnostics');
    req.flush({
      path: '/tmp/logs',
      files: ['.gitkeep', 'system-specs.txt', 'payloads.log.20260302T172915Z', 'payloads.log.20260302T170944Z'],
    });
    expect(comp.index).toBeTruthy();
    expect(comp.visibleFileCount).toBe(5);
    expect(comp.visibleFiles.length).toBe(3);
    expect(comp.visibleFiles[0]).toBe('payloads.log.20260302T172915Z');
    comp.setVisibleFileCount(-1);
    expect(comp.visibleFiles.length).toBe(3);
    // request system-specs
    comp.viewSystemSpecs();
    const req2 = httpMock.expectOne('/api/diagnostics/system-specs');
    req2.flush('cpu: test');
    expect(comp.systemSpecs).toContain('cpu: test');
    httpMock.verify();
  });
});

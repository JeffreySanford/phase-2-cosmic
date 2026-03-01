import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PromqlCardComponent } from './promql-card.component';
import { TelemetryService } from '../../services/telemetry.service';
import { of } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

describe('PromqlCardComponent', () => {
  let component: PromqlCardComponent;
  let fixture: ComponentFixture<PromqlCardComponent>;

  const mockTelemetry = {
    queryInstant: () => of(42),
    queryRange: () => of({ data: { result: [{ values: [[1, '1'], [2, '2'], [3, '3']] }] } }),
  } as unknown as TelemetryService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatCardModule, MatButtonModule],
      declarations: [PromqlCardComponent],
      providers: [{ provide: TelemetryService, useValue: mockTelemetry }],
    }).compileComponents();

    fixture = TestBed.createComponent(PromqlCardComponent);
    component = fixture.componentInstance;
    component.query = 'up';
    component.title = 'Test';
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('loads instant and range values on refresh', (done) => {
    component.refresh();
    setTimeout(() => {
      expect(component.currentValue).toBe(42);
      expect(component.points.length).toBeGreaterThan(0);
      done();
    }, 50);
  });
});

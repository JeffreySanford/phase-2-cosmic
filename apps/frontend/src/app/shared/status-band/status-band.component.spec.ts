import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusBandComponent } from './status-band.component';
import { SystemStatus, SystemStatusService } from '../../services/system-status.service';
import { Observable, of } from 'rxjs';
import { StatusBandModule } from './status-band.module';

describe('StatusBandComponent', () => {
  let component: StatusBandComponent;
  let fixture: ComponentFixture<StatusBandComponent>;
  let mockStatusService: { status$: Observable<SystemStatus> };

  beforeEach(async () => {
    mockStatusService = {
      status$: of({
        health: 'healthy' as const,
        lastCheck: new Date(),
        services: { governance: 'online' as const, streaming: 'online' as const }
      })
    };

    await TestBed.configureTestingModule({
      imports: [StatusBandModule],
      providers: [
        { provide: SystemStatusService, useValue: mockStatusService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBandComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should hide when system is healthy', () => {
    fixture.detectChanges();
    expect(component.shouldShow).toBe(false);
  });

  it('should show when system is degraded', () => {
    mockStatusService.status$ = of({
      health: 'degraded',
      lastCheck: new Date(),
      services: { governance: 'online', streaming: 'offline' }
    });
    component.ngOnInit();
    fixture.detectChanges();
    expect(component.shouldShow).toBe(true);
  });

  it('should show correct icon for offline status', () => {
    component.status = {
      health: 'offline',
      lastCheck: new Date(),
      services: { governance: 'offline', streaming: 'online' }
    };
    expect(component.getIcon()).toBe('error');
  });

  it('should format timestamp correctly', () => {
    const oldDate = new Date(Date.now() - 65000); // 65 seconds ago
    component.status = {
      health: 'healthy',
      lastCheck: oldDate,
      services: { governance: 'online', streaming: 'online' }
    };
    const timestamp = component.getTimestamp();
    expect(timestamp).toMatch(/1m ago/);
  });
});

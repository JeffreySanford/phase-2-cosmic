import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageStateComponent } from './page-state.component';
import { PageStateConfig } from './page-state.model';
import { PageStateModule } from './page-state.module';

describe('PageStateComponent', () => {
  let component: PageStateComponent;
  let fixture: ComponentFixture<PageStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageStateModule]
    }).compileComponents();

    fixture = TestBed.createComponent(PageStateComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render loading state', () => {
    const config: PageStateConfig = { state: 'loading', message: 'Loading data...' };
    component.config = config;
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.page-state--loading')).toBeTruthy();
    expect(compiled.textContent).toContain('Loading data...');
  });

  it('should render empty state', () => {
    const config: PageStateConfig = { state: 'empty', message: 'No jobs available' };
    component.config = config;
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.page-state--empty')).toBeTruthy();
    expect(compiled.textContent).toContain('No jobs available');
  });

  it('should render error state with action button', () => {
    const mockCallback = jest.fn();
    const config: PageStateConfig = {
      state: 'error',
      message: 'Failed to load',
      action: { label: 'Retry', callback: mockCallback }
    };
    component.config = config;
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.page-state--error')).toBeTruthy();
    expect(compiled.textContent).toContain('Failed to load');
    const button = compiled.querySelector('button');
    expect(button).toBeTruthy();
    button.click();
    expect(mockCallback).toHaveBeenCalled();
  });

  it('should render stale state as banner', () => {
    const config: PageStateConfig = { state: 'stale', message: 'Data is 5 minutes old' };
    component.config = config;
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.page-state__banner')).toBeTruthy();
    expect(compiled.textContent).toContain('Data is 5 minutes old');
  });

  it('should render recovered state', () => {
    const config: PageStateConfig = { state: 'recovered', message: 'Reconnected successfully' };
    component.config = config;
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.page-state--recovered')).toBeTruthy();
    expect(compiled.textContent).toContain('Reconnected successfully');
  });
});

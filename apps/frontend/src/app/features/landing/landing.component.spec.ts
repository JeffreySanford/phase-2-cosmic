import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LandingComponent } from './landing.component';
import { SidebarService } from '../../base/sidebar/sidebar.service';
import { BehaviorSubject } from 'rxjs';

class StubSidebar {
  collapsed$ = new BehaviorSubject(false);
  setCollapsed(v: boolean) { this.collapsed$.next(v); }
}

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let sidebar: StubSidebar;

  beforeEach(async () => {
    sidebar = new StubSidebar();
    await TestBed.configureTestingModule({
      declarations: [LandingComponent],
      providers: [{ provide: SidebarService, useValue: sidebar }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders welcome message', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h2')?.textContent).toContain('Welcome');
    expect(el.querySelector('p')?.textContent).toContain('sidebar');
  });

  it('responds to collapse state', () => {
    sidebar.setCollapsed(true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.landing');
    expect(el.classList).toContain('collapsed');
  });
});

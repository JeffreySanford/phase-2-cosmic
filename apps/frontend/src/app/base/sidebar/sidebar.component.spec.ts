import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SidebarComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders all routes with icons and labels', () => {
    const items = fixture.nativeElement.querySelectorAll('li');
    expect(items.length).toBe(component.routes.length);
    items.forEach((el: HTMLElement, idx: number) => {
      const icon = el.querySelector('.icon')?.textContent?.trim();
      const label = el.querySelector('.label')?.textContent?.trim();
      expect(icon).toBe(component.routes[idx].icon);
      expect(label).toBe(component.routes[idx].label);
    });
  });
});

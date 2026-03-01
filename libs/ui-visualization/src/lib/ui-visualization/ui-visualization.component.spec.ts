import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiVisualizationComponent } from './ui-visualization.component';

describe('UiVisualizationComponent', () => {
  let component: UiVisualizationComponent;
  let fixture: ComponentFixture<UiVisualizationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UiVisualizationComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(UiVisualizationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

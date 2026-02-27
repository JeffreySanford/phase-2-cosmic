import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { MainstageComponent } from './mainstage.component';

describe('MainstageComponent', () => {
  let component: MainstageComponent;
  let fixture: ComponentFixture<MainstageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [MainstageComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(MainstageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

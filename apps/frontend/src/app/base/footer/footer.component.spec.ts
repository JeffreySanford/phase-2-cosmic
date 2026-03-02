import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { FooterComponent } from './footer.component';
import { LoadProfileService } from '../../services/load-profile.service';
import { of } from 'rxjs';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let setProfileSpy: jest.Mock;

  beforeEach(async () => {
    setProfileSpy = jest.fn();
    const mockLoadProfile = {
      pollingMs$: of(1000),
      profile$: of(50),
      mode$: of('runtime-controlled'),
      setProfile: setProfileSpy,
    } as unknown as LoadProfileService;

    await TestBed.configureTestingModule({
      declarations: [FooterComponent],
      imports: [MatButtonModule, MatMenuModule],
      providers: [{ provide: LoadProfileService, useValue: mockLoadProfile }],
    }).compileComponents();
    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should forward setProfile to service', () => {
    component.setProfile(25);
    expect(setProfileSpy).toHaveBeenCalledWith(25);
  });
});

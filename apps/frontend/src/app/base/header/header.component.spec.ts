import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { RouterTestingModule } from '@angular/router/testing';
import { HeaderComponent } from './header.component';
import { SettingsDialogComponent } from '../../features/settings/settings-dialog.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let dialogOpenSpy: jest.Mock;

  beforeEach(async () => {
    dialogOpenSpy = jest.fn();
    await TestBed.configureTestingModule({
      declarations: [HeaderComponent],
      imports: [MatButtonModule, MatMenuModule, RouterTestingModule],
      providers: [{ provide: MatDialog, useValue: { open: dialogOpenSpy } }],
    }).compileComponents();
    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should open settings dialog', () => {
    component.openSettingsModal();
    expect(dialogOpenSpy).toHaveBeenCalledWith(
      SettingsDialogComponent,
      expect.objectContaining({ panelClass: 'settings-dialog-panel' })
    );
  });
});

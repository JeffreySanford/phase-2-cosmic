import { Component, EventEmitter, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { SettingsDialogComponent } from '../../features/settings/settings-dialog.component';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  @Output() toggleSidebar = new EventEmitter<void>();

  constructor(private readonly dialog: MatDialog, private readonly router: Router) {}

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  openSettingsModal(): void {
    this.dialog.open(SettingsDialogComponent, {
      panelClass: 'settings-dialog-panel',
      autoFocus: false,
      width: 'min(840px, 96vw)',
      maxWidth: '96vw',
      restoreFocus: true,
    });
  }

  openVisualizations(): void {
    void this.router.navigate(['/visualizations']);
  }
}

import { Component, EventEmitter, Output, inject } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { Router } from "@angular/router";
import { SettingsDialogComponent } from "../../features/settings/settings-dialog.component";

@Component({
  selector: "app-header",
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.scss"],
  standalone: false,
})
export class HeaderComponent {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  @Output() toggleSidebar = new EventEmitter<void>();

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  openSettingsModal(): void {
    this.dialog.open(SettingsDialogComponent, {
      panelClass: "settings-dialog-panel",
      autoFocus: false,
      width: "min(840px, 96vw)",
      maxWidth: "96vw",
      restoreFocus: true,
    });
  }

  openVisualizations(): void {
    void this.router.navigate(["/visualizations"]);
  }
}

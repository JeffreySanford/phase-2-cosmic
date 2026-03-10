import { Component } from "@angular/core";
import { SettingsService } from "./settings.service";

@Component({
  selector: "app-settings",
  templateUrl: "./settings.component.html",
  styleUrls: ["./settings.component.scss"],
  standalone: false,
})
export class SettingsComponent {
  constructor(public readonly settings: SettingsService) {}
}

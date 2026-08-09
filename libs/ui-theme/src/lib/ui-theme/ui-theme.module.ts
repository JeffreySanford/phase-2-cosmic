import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { UiThemeComponent } from "./ui-theme.component";

@NgModule({
  imports: [CommonModule, UiThemeComponent],
  exports: [UiThemeComponent],
})
export class UiThemeModule {}

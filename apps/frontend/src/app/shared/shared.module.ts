import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DynamicStyleDirective } from "./directives/dynamic-style.directive";

@NgModule({
  imports: [CommonModule],
  declarations: [DynamicStyleDirective],
  exports: [DynamicStyleDirective],
})
export class SharedModule {}

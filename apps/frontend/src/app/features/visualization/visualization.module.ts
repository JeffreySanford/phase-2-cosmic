import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { SharedModule } from "../../shared/shared.module";
import { VisualizationComponent } from "./visualization.component";

@NgModule({
  declarations: [VisualizationComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: "", component: VisualizationComponent }]),
    SharedModule,
  ],
  exports: [VisualizationComponent],
})
export class VisualizationModule {}

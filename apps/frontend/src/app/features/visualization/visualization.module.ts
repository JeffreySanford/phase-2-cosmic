import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { VisualizationComponent } from './visualization.component';

@NgModule({
  declarations: [VisualizationComponent],
  imports: [CommonModule, RouterModule.forChild([{ path: '', component: VisualizationComponent }])],
  exports: [VisualizationComponent]
})
export class VisualizationModule {}

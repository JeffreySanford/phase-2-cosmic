import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StatusBandComponent } from './status-band.component';

@NgModule({
  declarations: [StatusBandComponent],
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  exports: [StatusBandComponent],
})
export class StatusBandModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DataSourceLabelComponent } from './data-source-label.component';
import { PageStateComponent } from './page-state.component';

@NgModule({
  declarations: [PageStateComponent, DataSourceLabelComponent],
  imports: [CommonModule, MatProgressSpinnerModule, MatButtonModule, MatIconModule, MatChipsModule],
  exports: [PageStateComponent, DataSourceLabelComponent],
})
export class PageStateModule {}

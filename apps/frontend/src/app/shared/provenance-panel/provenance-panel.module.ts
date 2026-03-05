import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { ProvenancePanelComponent } from "./provenance-panel.component";

@NgModule({
  declarations: [ProvenancePanelComponent],
  imports: [CommonModule, RouterModule],
  exports: [ProvenancePanelComponent],
})
export class ProvenancePanelModule {}

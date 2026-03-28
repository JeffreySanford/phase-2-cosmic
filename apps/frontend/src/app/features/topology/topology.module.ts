import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatTabsModule } from "@angular/material/tabs";
import { PageStateModule } from "../../shared/page-state/page-state.module";
import { DisclaimerBannerModule } from "../../shared/disclaimer-banner/disclaimer-banner.module";
import { SharedModule } from "../../shared/shared.module";

import { TopologyComponent } from "./topology.component";
import { TopologyInfoDialogComponent } from "./topology-info-dialog.component";

@NgModule({
  declarations: [TopologyComponent, TopologyInfoDialogComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: "", component: TopologyComponent }]),
    MatButtonModule,
    MatDialogModule,
    MatTabsModule,
    PageStateModule,
    DisclaimerBannerModule,
    SharedModule,
  ],
  exports: [TopologyComponent],
})
export class TopologyModule {}

import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { DisclaimerBannerModule } from "../../shared/disclaimer-banner/disclaimer-banner.module";
import { ProvenancePanelModule } from "../../shared/provenance-panel/provenance-panel.module";
import { ExternalSourcesModule } from "../../shared/external-sources/external-sources.module";
import { DatasetsComponent } from "./datasets.component";

@NgModule({
  declarations: [DatasetsComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: "", component: DatasetsComponent }]),
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    DisclaimerBannerModule,
    ProvenancePanelModule,
    ExternalSourcesModule,
  ],
})
export class DatasetsModule {}

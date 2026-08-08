import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDialogModule } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatMenuModule } from "@angular/material/menu";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatTabsModule } from "@angular/material/tabs";
import { MatTooltipModule } from "@angular/material/tooltip";
import { LayoutModule } from "@angular/cdk/layout";

import { DisclaimerBannerModule } from "../../shared/disclaimer-banner/disclaimer-banner.module";
import { PromqlCardComponent } from "../../shared/promql-card/promql-card.component";
import { TelemetryModule } from "../telemetry/telemetry.module";
import { TridentAllocatorComponent } from "./trident-allocator/trident-allocator.component";

@NgModule({
  declarations: [PromqlCardComponent, TridentAllocatorComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LayoutModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTooltipModule,
    DisclaimerBannerModule,
    TelemetryModule,
  ],
  exports: [PromqlCardComponent, TridentAllocatorComponent],
})
export class DiagnosticsModule {}

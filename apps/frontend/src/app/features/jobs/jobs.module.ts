import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatDialogModule } from "@angular/material/dialog";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTabsModule } from "@angular/material/tabs";
import { MatSelectModule } from "@angular/material/select";
import { MatTooltipModule } from "@angular/material/tooltip";
import { DisclaimerBannerModule } from "../../shared/disclaimer-banner/disclaimer-banner.module";
import { ExternalSourcesModule } from "../../shared/external-sources/external-sources.module";
import { SharedModule } from "../../shared/shared.module";
import { JobsComponent } from "./jobs.component";
import { JobsSubmitDialogComponent } from "./jobs-submit-dialog.component";
import { JobsLineageEditorComponent } from "./jobs-lineage-editor.component";

@NgModule({
  declarations: [
    JobsComponent,
    JobsSubmitDialogComponent,
    JobsLineageEditorComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild([{ path: "", component: JobsComponent }]),
    MatCardModule,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTabsModule,
    MatSelectModule,
    MatTooltipModule,
    DisclaimerBannerModule,
    ExternalSourcesModule,
    SharedModule,
  ],
})
export class JobsModule {}

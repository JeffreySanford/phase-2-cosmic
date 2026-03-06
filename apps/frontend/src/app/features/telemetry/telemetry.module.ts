import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatTabsModule } from "@angular/material/tabs";

import { TelemetryComponent } from "./telemetry.component";
import { PulsarStatusComponent } from "./pulsar-status/pulsar-status.component";
import { RabbitMQStatusComponent } from "./rabbitmq-status/rabbitmq-status.component";

@NgModule({
  declarations: [
    TelemetryComponent,
    PulsarStatusComponent,
    RabbitMQStatusComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatTabsModule,
  ],
  exports: [TelemetryComponent, PulsarStatusComponent, RabbitMQStatusComponent],
})
export class TelemetryModule {}

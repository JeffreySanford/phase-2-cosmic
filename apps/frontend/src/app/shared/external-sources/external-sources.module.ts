import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ExternalSourcesComponent } from "./external-sources.component";

@NgModule({
  declarations: [ExternalSourcesComponent],
  imports: [CommonModule],
  exports: [ExternalSourcesComponent],
})
export class ExternalSourcesModule {}

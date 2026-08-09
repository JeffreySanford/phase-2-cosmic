import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";

import { HeaderComponent } from "./header/header.component";
import { FooterComponent } from "./footer/footer.component";
import { SidebarComponent } from "./sidebar/sidebar.component";
import { MainstageComponent } from "./mainstage/mainstage.component";
import { EnvironmentComponent } from "./environment/environment.component";

@NgModule({
  declarations: [
    HeaderComponent,
    FooterComponent,
    SidebarComponent,
    MainstageComponent,
    EnvironmentComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    MatMenuModule,
    MatButtonModule,
    MatSlideToggleModule,
  ],
  exports: [
    HeaderComponent,
    FooterComponent,
    SidebarComponent,
    MainstageComponent,
    EnvironmentComponent,
  ],
})
export class ShellModule {}

import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ReactiveFormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { EffectsModule } from "@ngrx/effects";
import { StoreModule } from "@ngrx/store";
import { ForgeComponent } from "./forge.component";
import { ForgeEffects } from "./state/forge.effects";
import { FORGE_FEATURE_KEY, forgeReducer } from "./state/forge.reducer";

@NgModule({
  declarations: [ForgeComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    StoreModule.forFeature(FORGE_FEATURE_KEY, forgeReducer),
    EffectsModule.forFeature([ForgeEffects]),
    RouterModule.forChild([{ path: "", component: ForgeComponent }]),
  ],
})
export class ForgeModule {}

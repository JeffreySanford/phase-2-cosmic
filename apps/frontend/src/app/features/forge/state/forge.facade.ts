import { Injectable, inject } from "@angular/core";
import { Store } from "@ngrx/store";
import { ForgeActions } from "./forge.actions";
import {
  ForgeCreateCompositeJobInputDto,
  ForgeCreateCutoutJobInputDto,
} from "./forge.models";
import { selectForgeVm } from "./forge.selectors";

@Injectable({ providedIn: "root" })
export class ForgeFacade {
  private readonly store = inject(Store);

  readonly vm$ = this.store.select(selectForgeVm);

  initialize(): void {
    this.store.dispatch(ForgeActions.initializeRequested());
  }

  refresh(): void {
    this.store.dispatch(ForgeActions.refreshRequested());
  }

  createCutoutJob(input: ForgeCreateCutoutJobInputDto): void {
    this.store.dispatch(ForgeActions.createCutoutJobRequested({ input }));
  }

  createCompositeJob(input: ForgeCreateCompositeJobInputDto): void {
    this.store.dispatch(ForgeActions.createCompositeJobRequested({ input }));
  }

  selectJob(jobId: string): void {
    this.store.dispatch(ForgeActions.selectJobRequested({ jobId }));
  }

  cancelJob(jobId: string): void {
    this.store.dispatch(ForgeActions.cancelJobRequested({ jobId }));
  }

  retryJob(jobId: string): void {
    this.store.dispatch(ForgeActions.retryJobRequested({ jobId }));
  }

  cacheImageArtifact(imageId: string): void {
    this.store.dispatch(ForgeActions.cacheImageArtifactRequested({ imageId }));
  }
}

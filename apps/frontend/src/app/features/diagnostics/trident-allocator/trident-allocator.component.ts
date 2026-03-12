import { Component, AfterViewInit, inject } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { BehaviorSubject } from "rxjs";

import {
  TridentAllocatorService,
  AllocateError,
} from "../../../services/trident-allocator.service";
import { BrowserPlatformService } from "../../../services/browser-platform.service";
import { FspAllocationPlan } from "../../../shared/trident.types";

@Component({
  selector: "app-trident-allocator",
  templateUrl: "./trident-allocator.component.html",
  styleUrls: ["./trident-allocator.component.scss"],
  standalone: false,
})
export class TridentAllocatorComponent implements AfterViewInit {
  private fb = inject(FormBuilder);
  private allocator = inject(TridentAllocatorService);
  private browser = inject(BrowserPlatformService);

  form: FormGroup;

  loading$ = new BehaviorSubject<boolean>(false);
  plan$ = new BehaviorSubject<FspAllocationPlan | null>(null);
  error$ = new BehaviorSubject<AllocateError | null>(null);

  simulatorAvailable$ = new BehaviorSubject<boolean>(false);
  simulatorMessage$ = new BehaviorSubject<string>("");

  showHeaderInfo = false;
  showResultInfo = false;

  private deferUiUpdate(task: () => void): void {
    setTimeout(task, 0);
  }

  constructor() {
    this.form = this.fb.group({
      id: ["sb-001", Validators.required],
      startTime: ["2026-04-01T08:00:00Z", Validators.required],
      endTime: ["2026-04-01T10:00:00Z", Validators.required],
      subarray: ["subarray-1", Validators.required],
      band: ["L"],
      channelWidth: [13440, [Validators.min(1)]],
      numChannels: [4096, [Validators.min(1)]],
    });
  }

  ngAfterViewInit(): void {
    this.deferUiUpdate(() => {
      this.allocator.health().subscribe({
        next: () => {
          this.simulatorAvailable$.next(true);
          this.simulatorMessage$.next("");
        },
        error: () => {
          this.simulatorAvailable$.next(false);
          this.simulatorMessage$.next(
            "Allocator simulator unreachable – start the service at http://localhost:7777"
          );
        },
      });
    });
  }

  submit(): void {
    if (this.form.invalid) return;

    this.loading$.next(true);
    this.plan$.next(null);
    this.error$.next(null);

    const v = this.form.value;
    this.allocator
      .allocate({
        schedulingBlock: {
          id: v.id,
          startTime: v.startTime,
          endTime: v.endTime,
          subarray: v.subarray,
        },
        spectralConfig:
          v.band || v.channelWidth
            ? {
                band: v.band,
                channelWidth: Number(v.channelWidth),
                numChannels: Number(v.numChannels),
              }
            : undefined,
      })
      .subscribe({
        next: (p) => {
          this.plan$.next(p);
          this.loading$.next(false);
        },
        error: (err: AllocateError) => {
          this.error$.next(err);
          this.loading$.next(false);
        },
      });
  }

  reset(): void {
    this.simulatorMessage$.next("");
    this.plan$.next(null);
    this.error$.next(null);
    this.form.reset({
      id: "sb-001",
      startTime: "2026-04-01T08:00:00Z",
      endTime: "2026-04-01T10:00:00Z",
      subarray: "subarray-1",
      band: "L",
      channelWidth: 13440,
      numChannels: 4096,
    });
  }

  downloadReport(): void {
    // nothing special
    const data = this.plan$.value ?? this.error$.value;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    this.browser.downloadBlob(blob, `trident-allocator-${Date.now()}.json`);
  }
}

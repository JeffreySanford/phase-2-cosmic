import { Component, OnInit, AfterViewInit } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";

import {
  TridentAllocatorService,
  AllocateError,
} from "../../../services/trident-allocator.service";
import { FspAllocationPlan } from "../../../shared/trident.types";

@Component({
  selector: "app-trident-allocator",
  templateUrl: "./trident-allocator.component.html",
  styleUrls: ["./trident-allocator.component.scss"],
  standalone: false,
})
export class TridentAllocatorComponent implements OnInit, AfterViewInit {
  form: FormGroup;

  loading = false;
  plan: FspAllocationPlan | null = null;
  error: AllocateError | null = null;

  simulatorAvailable = false;
  simulatorMessage = "";

  showHeaderInfo = false;
  showResultInfo = false;

  constructor(
    private fb: FormBuilder,
    private allocator: TridentAllocatorService
  ) {
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

  ngOnInit(): void {
    // probe simulator health so we can show a warning message when it's not running
    this.allocator.health().subscribe({
      next: () => {
        this.simulatorAvailable = true;
      },
      error: () => {
        this.simulatorAvailable = false;
        this.simulatorMessage =
          "Allocator simulator unreachable – start the service at http://localhost:7777";
      },
    });
  }

  ngAfterViewInit(): void {
    // make wheel event listeners passive to quiet console violation warnings
    const inputs = document.querySelectorAll(".allocator-container input");
    inputs.forEach((el) => {
      el.addEventListener(
        "wheel",
        (_event: Event) => {
          /* passive — no action needed */
        },
        { passive: true }
      );
    });
  }

  submit(): void {
    if (this.form.invalid) return;

    this.loading = true;
    this.plan = null;
    this.error = null;

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
          this.plan = p;
          this.loading = false;
        },
        error: (err: AllocateError) => {
          this.error = err;
          this.loading = false;
        },
      });
  }

  reset(): void {
    this.simulatorMessage = "";
    this.plan = null;
    this.error = null;
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
    const data = this.plan ?? this.error;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trident-allocator-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

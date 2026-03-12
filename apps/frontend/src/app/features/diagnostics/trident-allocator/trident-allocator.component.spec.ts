import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
  flush,
} from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { TridentAllocatorComponent } from "./trident-allocator.component";
import { TridentAllocatorService } from "../../../services/trident-allocator.service";
import { of, throwError } from "rxjs";

describe("TridentAllocatorComponent", () => {
  let component: TridentAllocatorComponent;
  let fixture: ComponentFixture<TridentAllocatorComponent>;
  let httpMock: HttpTestingController;
  let allocator: TridentAllocatorService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        HttpClientTestingModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatIconModule,
        MatButtonModule,
        BrowserAnimationsModule,
      ],
      declarations: [TridentAllocatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TridentAllocatorComponent);
    component = fixture.componentInstance;
    allocator = TestBed.inject(TridentAllocatorService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("shows warning when health request fails but still allows allocate clicks", fakeAsync(() => {
    // simulate failure by letting health() return error
    jest
      .spyOn(allocator, "health")
      .mockReturnValue(throwError(() => new Error("down")));
    fixture.detectChanges();
    tick();
    expect(component.simulatorAvailable$.value).toBeFalsy();
    expect(component.simulatorMessage$.value).toContain("unreachable");
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector(".simulator-warning")).toBeTruthy();
    const button = compiled.querySelector(
      "button[type=submit]"
    ) as HTMLButtonElement;
    expect(button.disabled).toBeFalsy();
    flush();
    tick(); // clear any remaining timer
  }));

  it("enables form when health succeeds and allows allocate", fakeAsync(() => {
    jest
      .spyOn(allocator, "health")
      .mockReturnValue(of({ status: "ok", service: "x" }));
    jest
      .spyOn(allocator, "allocate")
      .mockReturnValue(of({ planId: "p", subarray: "s", allocations: [] }));
    fixture.detectChanges();
    tick();
    expect(component.simulatorAvailable$.value).toBeTruthy();
    component.form.patchValue({
      id: "sb1",
      subarray: "sub1",
      startTime: "t1",
      endTime: "t2",
    });
    fixture.detectChanges();
    component.submit();
    expect(allocator.allocate).toHaveBeenCalled();
    flush();
    tick(); // make sure no timers are left behind
  }));
});

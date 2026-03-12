import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { SnackService } from "./snack.service";

describe("SnackService", () => {
  let snackBar: { open: jest.Mock };

  beforeEach(() => {
    snackBar = { open: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens success, info, warning and error snackbars with expected config", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: snackBar as unknown as MatSnackBar },
        SnackService,
      ],
    });

    const service = TestBed.inject(SnackService);

    service.showSuccess("saved");
    service.showInfo("info", 1234);
    service.showWarning("watch out", 5000);
    service.showError("broken");

    expect(snackBar.open).toHaveBeenNthCalledWith(1, "saved", undefined, {
      duration: 10000,
      horizontalPosition: "center",
      verticalPosition: "bottom",
      panelClass: ["snack-success", "app-snack"],
    });
    expect(snackBar.open).toHaveBeenNthCalledWith(2, "info", undefined, {
      duration: 1234,
      horizontalPosition: "center",
      verticalPosition: "bottom",
      panelClass: ["snack-info", "app-snack"],
    });
    expect(snackBar.open).toHaveBeenNthCalledWith(3, "watch out", undefined, {
      duration: 5000,
      horizontalPosition: "center",
      verticalPosition: "bottom",
      panelClass: ["snack-warning", "app-snack"],
    });
    expect(snackBar.open).toHaveBeenNthCalledWith(4, "broken", undefined, {
      duration: 10000,
      horizontalPosition: "center",
      verticalPosition: "bottom",
      panelClass: ["snack-error", "app-snack"],
    });
  });

  it("does not patch MatSnackBar._attach when running under Jest", () => {
    const sb: {
      open: jest.Mock;
      _attach: jest.Mock & { __stackingPatched?: boolean };
    } = {
      open: jest.fn(),
      _attach: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: sb as unknown as MatSnackBar },
        SnackService,
      ],
    });

    TestBed.inject(SnackService);
    expect(sb._attach.__stackingPatched).toBeUndefined();
  });
});

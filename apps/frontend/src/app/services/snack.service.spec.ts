import { MatSnackBar } from "@angular/material/snack-bar";
import { SnackService } from "./snack.service";

describe("SnackService", () => {
  let snackBar: { open: jest.Mock };
  let originalMutationObserver: typeof MutationObserver | undefined;

  beforeEach(() => {
    snackBar = { open: jest.fn() };
    originalMutationObserver = globalThis.MutationObserver;

    class FakeMutationObserver {
      constructor(private callback: MutationCallback) {
        void this.callback;
      }

      observe(): void {
        // no-op
      }
    }

    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      value: FakeMutationObserver,
    });

    document.body.innerHTML = "<footer></footer>";
    jest
      .spyOn(
        document.querySelector("footer") as HTMLElement,
        "getBoundingClientRect"
      )
      .mockReturnValue({
        height: 42.2,
      } as DOMRect);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      value: originalMutationObserver,
    });
  });

  it("initializes the footer height CSS variable", () => {
    new SnackService(snackBar as unknown as MatSnackBar);

    expect(
      document.documentElement.style.getPropertyValue("--app-footer-height")
    ).toBe("43px");
  });

  it("opens success, info, warning and error snackbars with expected config", () => {
    const service = new SnackService(snackBar as unknown as MatSnackBar);

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
    new SnackService(sb as unknown as MatSnackBar);
    expect(sb._attach.__stackingPatched).toBeUndefined();
  });
});

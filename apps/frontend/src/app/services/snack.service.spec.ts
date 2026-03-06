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
      .spyOn(document.querySelector("footer") as HTMLElement, "getBoundingClientRect")
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

  it("opens success, info, and error snackbars with expected config", () => {
    const service = new SnackService(snackBar as unknown as MatSnackBar);

    service.showSuccess("saved");
    service.showInfo("info", 1234);
    service.showError("broken");

    expect(snackBar.open).toHaveBeenNthCalledWith(1, "saved", undefined, {
      duration: 5000,
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
    expect(snackBar.open).toHaveBeenNthCalledWith(3, "broken", undefined, {
      duration: 8000,
      horizontalPosition: "center",
      verticalPosition: "bottom",
      panelClass: ["snack-error", "app-snack"],
    });
  });
});

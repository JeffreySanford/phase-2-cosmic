import { Injectable, inject } from "@angular/core";
import {
  MatSnackBar,
  MatSnackBarConfig,
  MatSnackBarRef,
} from "@angular/material/snack-bar";

// private helper types for the stacking patch.  We only expose the
// minimal surface we need and avoid `any` by using unknown generics.
// `AttachFn` mirrors the private `_attach` signature and includes an
// optional marker property on the function object itself so we can
// detect whether we've already patched it.
//
// We use an intersection with a callable signature rather than
// extending `Function` because it's easier to work with in casts.
type AttachFn = (
  content: unknown,
  userConfig?: MatSnackBarConfig
) => MatSnackBarRef<unknown>;

interface AttachFnWithFlag extends AttachFn {
  __stackingPatched?: boolean;
}

interface SnackBarInternal {
  _attach?: AttachFn;
  _openedSnackBarRef?: MatSnackBarRef<unknown> | null;
}

@Injectable({ providedIn: "root" })
export class SnackService {
  private snackBar = inject(MatSnackBar);

  constructor() {
    // hack: patch MatSnackBar instance so that opening a new snackbar
    // does not automatically dismiss the currently-displayed one.  This
    // allows multiple toasts to stack until their duration expires.  The
    // default implementation in Angular Material calls `_openedSnackBarRef
    // .dismiss()` at the start of `_attach`.  We temporarily clear that
    // reference before delegating to the original method.
    //
    // Avoid patching when running in the Jest environment; the override
    // triggers jsdom stylesheet parsing errors that clutter test output.
    const isJest =
      typeof process !== "undefined" &&
      process.env &&
      process.env["JEST_WORKER_ID"] !== undefined;
    if (!isJest) {
      const sb = this.snackBar as unknown as SnackBarInternal;
      if (sb && sb._attach) {
        const attachFn = sb._attach as AttachFnWithFlag; // function object with flag
        if (!attachFn.__stackingPatched) {
          const original = attachFn.bind(sb) as AttachFn;
          sb._attach = function (
            this: SnackBarInternal,
            content: unknown,
            userConfig?: MatSnackBarConfig
          ) {
            const oldRef = this._openedSnackBarRef;
            this._openedSnackBarRef = null;
            try {
              return original(content, userConfig);
            } finally {
              this._openedSnackBarRef = oldRef;
            }
          } as AttachFnWithFlag;
          (sb._attach as AttachFnWithFlag).__stackingPatched = true;
        }
      }
    }
  }

  private open(message: string, panelClass: string, duration = 10000) {
    const cfg: MatSnackBarConfig = {
      duration,
      horizontalPosition: "center",
      verticalPosition: "bottom",
      panelClass: [panelClass, "app-snack"],
      // by default mat-snackbar replaces existing; we circumvent by disabling
      // announce and letting multiple overlays stack via custom CSS rules
    };
    this.snackBar.open(message, undefined, cfg);
  }

  showSuccess(message: string, duration = 10000) {
    this.open(message, "snack-success", duration);
  }

  showInfo(message: string, duration = 10000) {
    this.open(message, "snack-info", duration);
  }

  showError(message: string, duration = 10000) {
    this.open(message, "snack-error", duration);
  }

  /**
   * Yellow / warning toast variant
   */
  showWarning(message: string, duration = 10000) {
    this.open(message, "snack-warning", duration);
  }
}

import {
  Component,
  AfterViewInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  Renderer2,
  Inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { SidebarService } from "../../base/sidebar/sidebar.service";
import {
  isAladinPrefetched as _isAladinPrefetched,
  getAladinInitPromise,
} from "../../services/aladin-prefetch.service";
import { from, of, defer, interval, throwError } from "rxjs";
import {
  mergeMap,
  catchError,
  filter,
  first,
  map,
  timeout,
  retryWhen,
  delay,
  tap,
  mapTo,
  startWith,
} from "rxjs/operators";

// Focused types for Aladin pieces used by the component
type ViewerInstance = {
  remove?: () => void;
  destroy?: () => void;
  resize?: (width: number, height: number) => void;
  [key: string]: unknown;
} | null;

type AladinFactory = (
  selector: string | HTMLElement,
  opts?: Record<string, unknown>
) => ViewerInstance | Promise<ViewerInstance> | unknown;

type AladinModuleDefault =
  | ((...args: unknown[]) => unknown)
  | { aladin?: AladinFactory; wasmLibs?: Record<string, unknown> };

interface AladinModule {
  default?: AladinModuleDefault;
  aladin?: AladinFactory;
  init?: () => Promise<void> | PromiseLike<void> | void;
  wasmLibs?: Record<string, unknown> | undefined;
}

@Component({
  selector: "app-viewer",
  templateUrl: "./viewer.component.html",
  styleUrls: ["./viewer.component.scss"],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild("aladinContainer", { static: true })
  containerRef!: ElementRef<HTMLElement>;

  @Input() survey = "https://healpix.ias.u-psud.fr/CDS_P_DSS2_color";
  @Input() fov = 60;
  @Input() target = "M42";
  @Input() showReticle = false;
  @Input() showLayersControl = false;
  @Input() showZoomControl = false;
  @Input() showFullScreenControl = false;

  @Output() viewerReady = new EventEmitter<ViewerInstance>();
  @Output() viewerError = new EventEmitter<unknown>();

  public instance: ViewerInstance = null;
  private injectedScripts: HTMLScriptElement[] = [];
  private isDestroyed = false;
  private resizeObserver?: ResizeObserver;

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private doc: Document,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private sidebarService: SidebarService
  ) {}

  ngAfterViewInit(): void {
    this.initViewer()
      .pipe(
        catchError((err) => {
          this.viewerError.emit(err);
          return of(void 0);
        })
      )
      .subscribe(() => {
        // set up a resize observer to notify Aladin of container size changes
        const el = this.containerRef.nativeElement;
        if (typeof ResizeObserver !== "undefined") {
          this.resizeObserver = new ResizeObserver(() => {
            try {
              const rect = el.getBoundingClientRect();
              if (this.instance && typeof this.instance.resize === "function") {
                this.instance.resize(rect.width, rect.height);
              }
            } catch {
              // ignore
            }
          });
          this.resizeObserver.observe(el);
        }

        // track sidebar collapse events so our viewer redraws when the stage width changes
        this.sidebarService.collapsed$.subscribe(() => {
          setTimeout(() => {
            try {
              const rect = el.getBoundingClientRect();
              if (this.instance && typeof this.instance.resize === "function") {
                this.instance.resize(rect.width, rect.height);
              }
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("resize"));
              }
            } catch {
              // ignore
            }
          }, 100);
        });
      });
  }

  // Run a function when the browser is idle (requestIdleCallback) with a setTimeout fallback.
  // Returns a promise that resolves/rejects with the function result.
  private runWhenIdle<T>(fn: () => T | Promise<T>): Promise<T> {
    if (typeof window === "undefined")
      return Promise.resolve(fn() as Promise<T>);

    return new Promise<T>((resolve, reject) => {
      const run = () => {
        try {
          // mark that we attempted to initialize Aladin (helps E2E tests detect module load attempts)
          // Intentionally no-op here; readiness is emitted via `viewerReady` event.
          Promise.resolve(fn()).then(resolve, reject);
        } catch (err) {
          reject(err);
        }
      };

      const ric = (
        globalThis as unknown as {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout: number }
          ) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === "function") {
        try {
          // timeout:500 ensures we don't wait more than 500ms even in dev mode
          // where Zone.js / HMR keeps the browser perpetually busy.
          ric(() => run(), { timeout: 500 });
        } catch {
          setTimeout(run, 0);
        }
      } else {
        setTimeout(run, 0);
      }
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;

    if (this.resizeObserver) {
      try {
        this.resizeObserver.disconnect();
      } catch {
        /* ignore */
      }
      this.resizeObserver = undefined;
    }

    try {
      if (this.instance && typeof this.instance.remove === "function") {
        this.instance.remove();
      } else if (this.instance && typeof this.instance.destroy === "function") {
        this.instance.destroy();
      }
    } catch {
      // ignore
    }

    for (const s of this.injectedScripts) {
      try {
        if (s.parentNode) s.parentNode.removeChild(s);
      } catch {
        // ignore
      }
    }
    this.injectedScripts = [];
  }

  private initViewer() {
    // Create minimal options for initial (fast) init — postpone expensive UI controls
    const optsMinimal = {
      survey: this.survey,
      fov: this.fov,
      target: this.target,
      showReticle: this.showReticle,
      // controls postponed until idle
      showLayersControl: false,
      showZoomControl: false,
      showFullScreenControl: false,
    } as Record<string, unknown>;

    const optsControls: {
      showLayersControl: boolean;
      showZoomControl: boolean;
      showFullScreenControl: boolean;
    } = {
      showLayersControl: this.showLayersControl,
      showZoomControl: this.showZoomControl,
      showFullScreenControl: this.showFullScreenControl,
    };

    if (
      typeof performance !== "undefined" &&
      typeof performance.mark === "function"
    ) {
      try {
        performance.mark("viewer:import-start");
      } catch {
        /* ignore */
      }
    }

    const import$ = defer(() => from(import("aladin-lite"))).pipe(
      tap(() => {
        try {
          if (
            typeof performance !== "undefined" &&
            typeof performance.mark === "function"
          )
            performance.mark("viewer:import-end");
        } catch {
          /* ignore */
        }
      }),
      map((m) => (m && (m.default ?? m)) as AladinModule)
    );

    const initAndWait$ = (mod: AladinModule) => {
      const maybeInit = mod.init;
      if (
        typeof maybeInit === "function" &&
        typeof performance !== "undefined" &&
        typeof performance.mark === "function"
      ) {
        try {
          performance.mark("viewer:init-start");
        } catch {
          /* ignore */
        }
      }
      // Run module init outside Angular and during idle to avoid blocking change detection
      const initPromise =
        typeof maybeInit === "function"
          ? this.ngZone.runOutsideAngular(() =>
              this.runWhenIdle(() => Promise.resolve(maybeInit()))
            )
          : Promise.resolve(mod);
      const init$ = from(initPromise).pipe(mapTo(mod));
      // mark init end when init$ completes
      const initMarked$ = init$.pipe(
        tap(() => {
          try {
            if (
              typeof performance !== "undefined" &&
              typeof performance.mark === "function"
            )
              performance.mark("viewer:init-end");
          } catch {
            /* ignore */
          }
        })
      );
      const poll$ = interval(100).pipe(
        startWith(0),
        map(() => {
          const m = mod as AladinModule | null;
          if (
            m &&
            m.wasmLibs &&
            (m.wasmLibs as Record<string, unknown>)["core"]
          )
            return true;
          const w = (this.doc.defaultView ?? window) as Window & {
            aladin?: AladinModule;
          };
          const a = w.aladin;
          if (
            a &&
            a.wasmLibs &&
            (a.wasmLibs as Record<string, unknown>)["core"]
          )
            return true;
          if (m && m.default && typeof m.default === "object") {
            const dd = m.default as unknown as {
              wasmLibs?: Record<string, unknown>;
            };
            if (dd.wasmLibs && dd.wasmLibs["core"]) return true;
          }
          return false;
        }),
        filter(Boolean),
        first(),
        timeout({ each: 5000 }),
        catchError(() => of(true)),
        mapTo(mod)
      );

      return initMarked$.pipe(mergeMap(() => poll$));
    };

    const create$ = (mod: AladinModule) => {
      const factory = this.resolveFactory(mod);
      if (!factory)
        return throwError(
          () => new Error("Aladin factory not found in module")
        );
      if (
        typeof performance !== "undefined" &&
        typeof performance.mark === "function"
      ) {
        try {
          performance.mark("viewer:create-start");
        } catch {
          /* ignore */
        }
      }
      // create minimal viewer now, enable controls later when idle
      // run factory invocation outside Angular to avoid Zone.js wrapping
      return defer(() =>
        from(
          this.ngZone.runOutsideAngular(() =>
            this.runWhenIdle(() =>
              this.withPassiveListeners(() =>
                factory(this.containerRef.nativeElement, optsMinimal)
              )
            )
          )
        )
      );
    };

    const maxRetries = 5;

    return import$.pipe(
      mergeMap((mod) => {
        // If prefetch is in-flight or complete, await the same promise
        // so we never run a second parallel init() / WASM compile.
        const prefetch = getAladinInitPromise();
        if (prefetch) {
          return from(prefetch.then(() => mod).catch(() => mod));
        }
        return initAndWait$(mod);
      }),
      mergeMap((mod) =>
        create$(mod).pipe(
          retryWhen((errors) =>
            errors.pipe(
              mergeMap((err: unknown, i: number) => {
                const msg =
                  err && typeof err === "object"
                    ? String(
                        (err as Error & { message?: string }).message ?? err
                      )
                    : String(err);
                const transient = /WebClient|setProjection/i.test(msg);
                if (!transient || i >= maxRetries)
                  return throwError(() =>
                    err instanceof Error ? err : new Error(String(err))
                  );
                const delayMs = Math.min(1000, 100 * Math.pow(2, i + 1));
                return of(null).pipe(delay(delayMs));
              })
            )
          )
        )
      ),
      tap((inst) => {
        this.instance = (inst as ViewerInstance) ?? null;
        this.viewerReady.emit(this.instance);
        // mark for check since we're OnPush
        try {
          this.cdr.markForCheck();
        } catch {
          /* ignore */
        }

        // signal readiness to external E2E tools and listeners
        try {
          const el = this.containerRef && this.containerRef.nativeElement;
          if (el && typeof (el as HTMLElement).setAttribute === "function") {
            try {
              (el as HTMLElement).setAttribute("data-viewer-ready", "true");
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
        try {
          if (
            typeof window !== "undefined" &&
            typeof CustomEvent === "function"
          ) {
            try {
              window.dispatchEvent(
                new CustomEvent("aladin-ready", {
                  detail: { instance: this.instance },
                })
              );
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }

        // mark create end and measure
        try {
          if (
            typeof performance !== "undefined" &&
            typeof performance.mark === "function" &&
            typeof performance.measure === "function"
          ) {
            try {
              performance.mark("viewer:create-end");
            } catch {
              /* ignore */
            }
            try {
              performance.measure(
                "viewer:create",
                "viewer:create-start",
                "viewer:create-end"
              );
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }

        // enable controls in idle time to reduce initial blocking
        try {
          if (
            typeof performance !== "undefined" &&
            typeof performance.mark === "function"
          )
            performance.mark("viewer:controls-enable-start");
        } catch {
          /* ignore */
        }
        this.ngZone.runOutsideAngular(() =>
          this.runWhenIdle(() => {
            try {
              if (!this.instance) return;
              const instAny = this.instance as NonNullable<ViewerInstance>;
              // try common APIs to enable controls if available (use bracket access for index signature)
              // try common APIs to enable controls if available (use bracket access for index signature)
              const setOpts = instAny["setOptions"] as unknown;
              if (typeof setOpts === "function") {
                // typed as accepting the control options object
                (setOpts as (o: typeof optsControls) => void)(optsControls);
                return;
              }

              const addControl = instAny["addControl"] as unknown;
              if (typeof addControl === "function") {
                const addFn = addControl as (name: string) => void;
                if (optsControls.showLayersControl) addFn("layers");
                if (optsControls.showZoomControl) addFn("zoom");
                if (optsControls.showFullScreenControl) addFn("fullscreen");
                return;
              }

              // fallback: if factory supports a lightweight reconfiguration call
              const updateFn = instAny["update"] as unknown;
              if (typeof updateFn === "function") {
                (updateFn as (o: typeof optsControls) => void)(optsControls);
              }
            } catch {
              // ignore — enabling controls is best-effort
            } finally {
              try {
                if (
                  typeof performance !== "undefined" &&
                  typeof performance.mark === "function" &&
                  typeof performance.measure === "function"
                ) {
                  try {
                    performance.mark("viewer:controls-enable-end");
                  } catch {
                    /* ignore */
                  }
                  try {
                    performance.measure(
                      "viewer:controls-enable",
                      "viewer:controls-enable-start",
                      "viewer:controls-enable-end"
                    );
                  } catch {
                    /* ignore */
                  }
                }
              } catch {
                /* ignore */
              }
            }
          })
        );
      }),
      mapTo(void 0)
    );
  }

  // factory-based creation handled in the observable init pipeline above

  private resolveFactory(
    moduleObj: AladinModule | null
  ): AladinFactory | undefined {
    if (!moduleObj) return undefined;
    if (typeof moduleObj === "function")
      return moduleObj as unknown as AladinFactory;
    if (typeof moduleObj.aladin === "function")
      return moduleObj.aladin as AladinFactory;
    if (moduleObj.default) {
      const d = moduleObj.default as AladinModuleDefault;
      if (typeof d === "function") return d as unknown as AladinFactory;
      if (d && typeof (d as { aladin?: unknown }).aladin === "function")
        return (d as { aladin: AladinFactory }).aladin;
    }
    return undefined;
  }

  // Temporarily wrap `addEventListener` to mark common scroll/touch listeners as passive
  // during the critical factory invocation so third-party libs (aladin) don't add
  // non-passive listeners that trigger console violations. The original is restored
  // immediately after the wrapped function completes.
  private withPassiveListeners<T>(fn: () => T): T {
    if (typeof window === "undefined") return fn();

    const globalWin = globalThis as unknown as {
      EventTarget?: { prototype?: unknown };
    };
    const protoRaw = globalWin.EventTarget?.prototype;
    if (
      !protoRaw ||
      typeof (protoRaw as { addEventListener?: unknown }).addEventListener !==
        "function"
    )
      return fn();

    type AE = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) => void;
    const proto = protoRaw as { addEventListener: AE };

    // touchstart/touchmove → passive for scroll performance.
    // wheel → explicitly non-passive so Aladin can preventDefault() and capture zoom
    // without Chrome silently upgrading the listener to passive.
    const passiveTypes = ["touchstart", "touchmove"];
    const nonPassiveTypes = ["wheel"];
    const original: AE = proto.addEventListener;

    try {
      proto.addEventListener = function (
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) {
        try {
          if (
            passiveTypes.indexOf(type) !== -1 &&
            (options === undefined || options === null)
          ) {
            return original.call(this, type, listener, { passive: true });
          }
          if (
            nonPassiveTypes.indexOf(type) !== -1 &&
            (options === undefined || options === null)
          ) {
            return original.call(this, type, listener, { passive: false });
          }
        } catch {
          // fall back to original call
        }
        return original.call(this, type, listener, options);
      };
    } catch {
      return fn();
    }

    try {
      return fn();
    } finally {
      try {
        proto.addEventListener = original;
      } catch {
        // ignore
      }
    }
  }

  // wasm readiness is polled from the init observable pipeline; helper removed

  // asset loader removed: component uses canonical `aladin-lite` dynamic import per spec
}

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
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  inject,
} from "@angular/core";
import { SidebarService } from "../../base/sidebar/sidebar.service";
import { BrowserPlatformService } from "../../services/browser-platform.service";
import {
  Observable,
  defer,
  from,
  interval,
  isObservable,
  of,
  throwError,
  Subscription,
} from "rxjs";
import {
  catchError,
  first,
  filter,
  map,
  mapTo,
  shareReplay,
  startWith,
  switchMap,
  tap,
  timeout,
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
  private renderer = inject(Renderer2);
  private browser = inject(BrowserPlatformService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private sidebarService = inject(SidebarService);

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
  private sidebarSubscription?: Subscription;

  private get browserWindow(): Window | null {
    return this.browser.window;
  }

  private dispatchBrowserEvent(
    type: "resize" | "aladin-ready",
    detail?: Record<string, unknown>
  ): void {
    this.browser.dispatchWindowEvent(type, detail);
  }

  private getContainerElement(): HTMLElement | null {
    return this.containerRef?.nativeElement ?? null;
  }

  ngAfterViewInit(): void {
    this.initViewer()
      .pipe(
        catchError((err) => {
          console.error("Viewer init failed:", err);
          this.initViewer$ = undefined; // allow retries
          this.viewerError.emit(err);
          return of(void 0);
        })
      )
      .subscribe(() => {
        // set up a resize observer to notify Aladin of container size changes
        const el = this.getContainerElement();
        const ResizeObserverCtor = (
          this.browser.window as Window & {
            ResizeObserver?: typeof ResizeObserver;
          }
        )?.ResizeObserver;
        if (el && typeof ResizeObserverCtor === "function") {
          const container = el; // narrow to non-null for use inside the callback
          this.resizeObserver = new ResizeObserverCtor(() => {
            try {
              const rect = container.getBoundingClientRect();
              if (this.instance && typeof this.instance.resize === "function") {
                this.instance.resize(rect.width, rect.height);
              }
            } catch {
              // ignore
            }
          });
          this.resizeObserver.observe(container);
        }

        // track sidebar collapse events so our viewer redraws when the stage width changes
        this.sidebarSubscription = this.sidebarService.collapsed$.subscribe(
          () => {
            setTimeout(() => {
              try {
                const c = this.getContainerElement();
                if (!c) return;
                const rect = c.getBoundingClientRect();
                if (
                  this.instance &&
                  typeof this.instance.resize === "function"
                ) {
                  this.instance.resize(rect.width, rect.height);
                }
                this.dispatchBrowserEvent("resize");
              } catch {
                // ignore
              }
            }, 100);
          }
        );
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
    this.sidebarSubscription?.unsubscribe();
    this.sidebarSubscription = undefined;

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

  private initViewer$?: Observable<void>;

  private initViewer(): Observable<void> {
    if (!this.initViewer$) {
      this.initViewer$ = this.createInitViewer$().pipe(
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.initViewer$;
  }

  private createInitViewer$(): Observable<void> {
    const optsMinimal = {
      survey: this.survey,
      fov: this.fov,
      target: this.target,
      showReticle: this.showReticle,
      showLayersControl: false,
      showZoomControl: false,
      showFullScreenControl: false,
    } as Record<string, unknown>;

    const optsControls = {
      showLayersControl: this.showLayersControl,
      showZoomControl: this.showZoomControl,
      showFullScreenControl: this.showFullScreenControl,
    };

    return defer(() => from(import("aladin-lite"))).pipe(
      map(
        (imported) =>
          (imported && (imported.default ?? imported)) as AladinModule
      ),
      switchMap((mod) => this.callModuleInit$(mod).pipe(mapTo(mod))),
      switchMap((mod) => this.waitForWasmReady$(mod).pipe(mapTo(mod))),
      switchMap((mod) =>
        this.createViewerInstance$(mod, optsMinimal, optsControls)
      )
    );
  }

  private callModuleInit$(mod: AladinModule): Observable<void> {
    const init = mod?.init;
    if (!init) return of(void 0);

    return this.ngZone.runOutsideAngular(() =>
      this.runWhenIdle$(() => {
        if (typeof init === "function") {
          return init();
        }
        // `init` can be a Promise (as seen in newer aladin-lite builds)
        if (typeof (init as any).then === "function") {
          return init as unknown as Promise<void>;
        }
        return void 0;
      }).pipe(mapTo(void 0))
    );
  }

  private createViewerInstance$(
    mod: AladinModule,
    optsMinimal: Record<string, unknown>,
    optsControls: {
      showLayersControl: boolean;
      showZoomControl: boolean;
      showFullScreenControl: boolean;
    }
  ): Observable<void> {
    const container = this.getContainerElement();
    if (!container) {
      return throwError(
        () => new Error("Viewer container element not available")
      );
    }

    const factory = this.resolveFactory(mod);
    if (!factory) {
      return throwError(() => new Error("Aladin factory not found in module"));
    }

    return this.ngZone.runOutsideAngular(() =>
      this.runWhenIdle$(() =>
        this.withPassiveListeners(() => {
          const inst = factory(container, optsMinimal);
          return inst;
        })
      ).pipe(
        tap((inst) => {
          this.handleViewerInstance(inst as ViewerInstance);
          this.enableViewerControls(optsControls);
        }),
        mapTo(void 0),
        catchError((err) => {
          console.error("createViewerInstance$ failed", err);
          return throwError(() => err);
        }),
        timeout({
          each: 15000,
          with: () =>
            throwError(
              () => new Error("createViewerInstance$ timed out after 15s")
            ),
        })
      )
    );
  }

  private runWhenIdle$<T>(
    fn: () => T | PromiseLike<T> | Observable<T>
  ): Observable<T> {
    return new Observable<T>((subscriber) => {
      let cancelled = false;
      let sub: Subscription | undefined;

      const run = () => {
        if (cancelled) return;
        const result = fn();
        const obs = isObservable(result)
          ? result
          : from(Promise.resolve(result as PromiseLike<T>));
        sub = obs.subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      };

      const browserWindow = this.browser.window;
      const timeoutFn = browserWindow?.setTimeout ?? setTimeout;
      const clearFn = browserWindow?.clearTimeout ?? clearTimeout;

      const handle = timeoutFn(() => {
        run();
      }, 0);

      return () => {
        cancelled = true;
        sub?.unsubscribe();
        if (typeof handle === "number") {
          clearFn(handle);
        }
      };
    });
  }

  private waitForWasmReady$(mod: AladinModule): Observable<void> {
    // `aladin-lite` now sometimes exports `init` as a Promise already
    // resolved when wasm is ready. If `init` is present we consider wasm ready.
    if (mod?.init) {
      return of(void 0);
    }

    return interval(100).pipe(
      startWith(0),
      filter(() => this.isWasmReady(mod)),
      first(),
      timeout({
        each: 30000,
        with: () =>
          throwError(
            () => new Error("Aladin wasm did not become ready in time")
          ),
      }),
      mapTo(void 0)
    );
  }

  private isWasmReady(mod: AladinModule | null): boolean {
    if (!mod) return false;
    if (mod.wasmLibs && (mod.wasmLibs as Record<string, unknown>)["core"])
      return true;
    const browserWindow = this.browserWindow as
      | (Window & { aladin?: AladinModule })
      | null;
    const w = browserWindow ?? null;
    const a = w?.aladin;
    if (a && a.wasmLibs && (a.wasmLibs as Record<string, unknown>)["core"])
      return true;
    if (mod.default && typeof mod.default === "object") {
      const d = mod.default as unknown as {
        wasmLibs?: Record<string, unknown>;
      };
      return Boolean(d.wasmLibs?.["core"]);
    }
    return false;
  }

  private enableViewerControls(optsControls: {
    showLayersControl: boolean;
    showZoomControl: boolean;
    showFullScreenControl: boolean;
  }): void {
    this.ngZone.runOutsideAngular(() => {
      this.runWhenIdle$(() => {
        try {
          if (!this.instance) return;
          const instAny = this.instance as NonNullable<ViewerInstance>;
          const setOpts = instAny["setOptions"] as unknown;
          if (typeof setOpts === "function") {
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

          const updateFn = instAny["update"] as unknown;
          if (typeof updateFn === "function") {
            (updateFn as (o: typeof optsControls) => void)(optsControls);
          }
        } catch {
          // ignore — enabling controls is best-effort
        }
      }).subscribe({
        error: () => {
          /* ignore */
        },
      });
    });
  }

  private handleViewerInstance(inst: ViewerInstance | null): void {
    this.instance = inst ?? null;
    this.viewerReady.emit(this.instance);

    try {
      this.cdr.markForCheck();
    } catch {
      /* ignore */
    }

    try {
      const el = this.getContainerElement();
      if (el && typeof el.setAttribute === "function") {
        try {
          el.setAttribute("data-viewer-ready", "true");
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }

    try {
      this.dispatchBrowserEvent("aladin-ready", {
        instance: this.instance,
      });
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

    const optsControls = {
      showLayersControl: this.showLayersControl,
      showZoomControl: this.showZoomControl,
      showFullScreenControl: this.showFullScreenControl,
    };

    try {
      if (
        typeof performance !== "undefined" &&
        typeof performance.mark === "function"
      )
        performance.mark("viewer:controls-enable-start");
    } catch {
      /* ignore */
    }

    this.ngZone.runOutsideAngular(() => {
      this.runWhenIdle$(() => {
        try {
          if (!this.instance) return;
          const instAny = this.instance as NonNullable<ViewerInstance>;
          const setOpts = instAny["setOptions"] as unknown;
          if (typeof setOpts === "function") {
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
      }).subscribe({
        error: () => {
          /* ignore */
        },
      });
    });
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
    const browserWindow = this.browser.window;
    if (!browserWindow) return fn();

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

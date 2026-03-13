import { DOCUMENT, isPlatformBrowser } from "@angular/common";
import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  Renderer2,
  RendererStyleFlags2,
  ViewChild,
  inject,
} from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import { BrowserPlatformService } from "../../services/browser-platform.service";
import {
  LoadProfilePct,
  LoadProfileService,
} from "../../services/load-profile.service";
import {
  DataSourceService,
  DataMode,
} from "../../services/data-source.service";
import { MatSlideToggleChange } from "@angular/material/slide-toggle";
import { filter, Subscription } from "rxjs";

@Component({
  selector: "app-footer",
  templateUrl: "./footer.component.html",
  styleUrls: ["./footer.component.scss"],
  standalone: false,
})
export class FooterComponent implements AfterViewInit, OnDestroy {
  private loadProfile = inject(LoadProfileService);
  private readonly zone = inject(NgZone);
  private readonly dataSource = inject(DataSourceService);
  private readonly router = inject(Router);
  private readonly renderer = inject(Renderer2);
  private readonly browser = inject(BrowserPlatformService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild("footerEl", { static: true })
  private footerRef?: ElementRef<HTMLElement>;

  readonly profileOptions: Array<{
    value: LoadProfilePct;
    label: string;
    note: string;
  }> = [
    { value: 10, label: "10% (Default)", note: "Normal development" },
    { value: 25, label: "25%", note: "Low stress profile" },
    { value: 50, label: "50%", note: "Medium stress profile" },
    { value: 100, label: "100%", note: "Smoke stress profile" },
  ];

  private resizeObserver?: ResizeObserver;
  private removeWindowResizeListener?: () => void;
  private routerSub?: Subscription;
  private currentUrl = "";

  constructor() {
    this.currentUrl = this.router.url || "";
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl = (event as NavigationEnd).urlAfterRedirects;
      });
  }

  setMode(m: DataMode) {
    this.dataSource.setMode(m);
  }

  onToggle(ev: MatSlideToggleChange) {
    this.setMode(ev.checked ? "mock" : "live");
  }

  get mode$() {
    return this.dataSource.mode$;
  }

  ngAfterViewInit(): void {
    this.updateFooterHeightVar();
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.removeWindowResizeListener = this.renderer.listen(
      "window",
      "resize",
      () => this.updateFooterHeightVar()
    );
    const footer = this.footerRef?.nativeElement;
    const ResizeObserverCtor = (
      this.browser.window as Window & { ResizeObserver?: typeof ResizeObserver }
    )?.ResizeObserver;
    if (!footer || !ResizeObserverCtor) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserverCtor(() =>
        this.updateFooterHeightVar()
      );
      this.resizeObserver?.observe(footer);
    });
  }

  ngOnDestroy(): void {
    this.removeWindowResizeListener?.();
    this.resizeObserver?.disconnect();
    this.routerSub?.unsubscribe();
  }

  get profile$() {
    return this.loadProfile.profile$;
  }

  get loadProfileMode$() {
    return this.loadProfile.mode$;
  }

  setProfile(pct: LoadProfilePct): void {
    this.loadProfile.setProfile(pct);
  }

  modeLabel(mode: DataMode | null | undefined): string {
    if (mode === "mock") return "Mock Data";
    if (this.isTopologyRoute()) return "Live Data";
    return "Live";
  }

  private isTopologyRoute(): boolean {
    return this.currentUrl.startsWith("/topology");
  }

  private updateFooterHeightVar(): void {
    const root = this.document?.documentElement;
    if (!root) {
      return;
    }
    const footer = this.footerRef?.nativeElement;
    const height = footer
      ? Math.ceil(footer.getBoundingClientRect().height)
      : 0;
    this.renderer.setStyle(
      root,
      "--app-footer-height",
      `${height}px`,
      RendererStyleFlags2.DashCase
    );
  }
}

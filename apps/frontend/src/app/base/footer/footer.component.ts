import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy } from '@angular/core';
import { LoadProfilePct, LoadProfileService } from '../../services/load-profile.service';
import { DataSourceService, DataMode } from '../../services/data-source.service';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent implements AfterViewInit, OnDestroy {
  readonly profileOptions: Array<{ value: LoadProfilePct; label: string; note: string }> = [
    { value: 10, label: '10% (Default)', note: 'Normal development' },
    { value: 25, label: '25%', note: 'Low stress profile' },
    { value: 50, label: '50%', note: 'Medium stress profile' },
    { value: 100, label: '100%', note: 'Smoke stress profile' },
  ];

  private resizeObserver?: ResizeObserver;
  private readonly onWindowResize = () => this.updateFooterHeightVar();

  constructor(
    private loadProfile: LoadProfileService,
    private readonly el: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
    private readonly dataSource: DataSourceService
  ) {}

  setMode(m: DataMode) {
    this.dataSource.setMode(m);
  }

  onToggle(ev: MatSlideToggleChange) {
    this.setMode(ev.checked ? 'mock' : 'live');
  }

  get mode$() {
    return this.dataSource.mode$;
  }

  ngAfterViewInit(): void {
    this.updateFooterHeightVar();
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('resize', this.onWindowResize);
    const footer = this.findFooterElement();
    if (!footer || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.updateFooterHeightVar());
      this.resizeObserver.observe(footer);
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize);
    }
    this.resizeObserver?.disconnect();
  }

  get profile$() {
    return this.loadProfile.profile$;
  }

  setProfile(pct: LoadProfilePct): void {
    this.loadProfile.setProfile(pct);
  }

  private findFooterElement(): HTMLElement | null {
    return this.el.nativeElement.querySelector('footer.app-footer');
  }

  private updateFooterHeightVar(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const footer = this.findFooterElement();
    const height = footer ? Math.ceil(footer.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--app-footer-height', `${height}px`);
  }
}

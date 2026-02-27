import { Component, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { SidebarService } from './base/sidebar/sidebar.service';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements AfterViewInit {
  title = 'frontend';
  sidebarCollapsed = false;

  constructor(private router: Router, private sidebarService: SidebarService) {}

  sidebarToggle() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.sidebarService.setCollapsed(this.sidebarCollapsed);
  }

  ngAfterViewInit(): void {
    // Small runtime diagnostic to print bounding rects for header/mainstage/footer
    // Helps identify which element is imposing unexpected vertical offsets.
    setTimeout(() => {
      try {
        const header = document.querySelector('.app-header') as HTMLElement | null;
        const main = document.querySelector('.app-mainstage') as HTMLElement | null;
        const footer = document.querySelector('.app-footer') as HTMLElement | null;
        const viewer = document.querySelector('.viewer-root') as HTMLElement | null;
        console.debug('LAYOUT-DIAG', {
          header: header?.getBoundingClientRect(),
          main: main?.getBoundingClientRect(),
          footer: footer?.getBoundingClientRect(),
          viewer: viewer?.getBoundingClientRect(),
        });
      } catch (e) {
        // swallow in prod; only for dev diagnostics
      }
    }, 800);
  }

  onNavigate(path: any) {
    this.router.navigate([path]);
  }
}

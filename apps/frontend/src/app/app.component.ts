import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SidebarService } from './base/sidebar/sidebar.service';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'frontend';
  sidebarCollapsed = false;

  constructor(private router: Router, private sidebarService: SidebarService) {}

  sidebarToggle() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.sidebarService.setCollapsed(this.sidebarCollapsed);
  }

  

  onNavigate(path: any) {
    this.router.navigate([path]);
  }
}

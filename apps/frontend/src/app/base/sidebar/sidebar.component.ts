import { Component, Input, Output, EventEmitter } from '@angular/core';

interface SidebarRoute {
  path: string;
  label: string;
  icon: string; // could be a material icon name or emoji
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  @Input() collapsed = false;
  @Output() navigate = new EventEmitter<string>();

  routes: SidebarRoute[] = [
    { path: '/landing', label: 'Home', icon: '🏠' },
    { path: '/view', label: 'Viewer', icon: '👀' },
    { path: '/dashboard', label: 'Dashboard', icon: '📈' },
    { path: '/telemetry', label: 'Telemetry', icon: '📡' },
    { path: '/jobs', label: 'Jobs', icon: '🗂️' },
    { path: '/visualizations', label: 'Visualizations', icon: '📊' },
    { path: '/topology', label: 'Topology', icon: '🗺️' },
    { path: '/diagnostics', label: 'Diagnostics', icon: '🛠️' },
  ];

  onNavigate(path: string) {
    this.navigate.emit(path);
  }
}

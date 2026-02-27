import { Component, OnDestroy } from '@angular/core';
import { SidebarService } from '../../base/sidebar/sidebar.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent implements OnDestroy {
  collapsed = false;
  private sub = new Subscription();

  constructor(sidebar: SidebarService) {
    this.sub.add(sidebar.collapsed$.subscribe((v) => (this.collapsed = v)));
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}

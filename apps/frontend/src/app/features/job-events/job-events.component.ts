import { Component, OnInit, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";
import { BrokerEventsService } from "../../services/broker-events.service";

interface BrokerEvent {
  type: string;
  payload: Record<string, unknown>;
}

@Component({
  selector: "app-job-events",
  templateUrl: "./job-events.component.html",
  styleUrls: ["./job-events.component.scss"],
  standalone: false,
})
export class JobEventsComponent implements OnInit, OnDestroy {
  recentEvents: BrokerEvent[] = [];
  private sub?: Subscription;

  constructor(private broker: BrokerEventsService) {}

  ngOnInit(): void {
    this.sub = this.broker.events.subscribe((evt) => {
      // keep a small buffer of events for display
      this.recentEvents.unshift(evt);
      if (this.recentEvents.length > 10) {
        this.recentEvents.pop();
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

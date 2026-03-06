import { Component, Input } from "@angular/core";
import { RabbitMQStatus } from "../../../shared/types";

@Component({
  selector: "app-rabbitmq-status",
  templateUrl: "./rabbitmq-status.component.html",
  styleUrls: ["./rabbitmq-status.component.scss"],
  standalone: false
})
export class RabbitMQStatusComponent {
  @Input() status: RabbitMQStatus = { status: 'unknown', connection: 'unknown' };

  getQueuesCount(): number {
    return this.status.queues ? Object.keys(this.status.queues).length : 0;
  }

  getExchangesCount(): number {
    return this.status.exchanges ? Object.keys(this.status.exchanges).length : 0;
  }
}
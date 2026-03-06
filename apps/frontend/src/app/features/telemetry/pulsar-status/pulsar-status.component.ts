import { Component, Input } from "@angular/core";

interface PulsarStatus {
  brokers: number;
  topics: number;
  partitions: number;
}

@Component({
  selector: "app-pulsar-status",
  templateUrl: "./pulsar-status.component.html",
  styleUrls: ["./pulsar-status.component.scss"],
  standalone: false,
})
export class PulsarStatusComponent {
  @Input() status: PulsarStatus = { brokers: 0, topics: 0, partitions: 0 };
}

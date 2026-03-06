import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatCardModule } from "@angular/material/card";
import { RabbitMQStatusComponent } from "./rabbitmq-status.component";
import { RabbitMQStatus } from "../../../shared/types";

describe("RabbitMQStatusComponent", () => {
  let component: RabbitMQStatusComponent;
  let fixture: ComponentFixture<RabbitMQStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatCardModule],
      declarations: [RabbitMQStatusComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RabbitMQStatusComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should display connected status", () => {
    const testStatus: RabbitMQStatus = {
      status: "connected",
      connection: "connected",
      queues: { queue1: {}, queue2: {} },
      exchanges: { exchange1: {} },
    };
    component.status = testStatus;
    fixture.detectChanges();

    expect(component.getQueuesCount()).toBe(2);
    expect(component.getExchangesCount()).toBe(1);
  });

  it("should handle empty queues and exchanges", () => {
    const testStatus: RabbitMQStatus = {
      status: "connected",
      connection: "connected",
      queues: {},
      exchanges: {},
    };
    component.status = testStatus;
    fixture.detectChanges();

    expect(component.getQueuesCount()).toBe(0);
    expect(component.getExchangesCount()).toBe(0);
  });

  it("should handle undefined queues and exchanges", () => {
    const testStatus: RabbitMQStatus = {
      status: "disconnected",
      connection: "disconnected",
    };
    component.status = testStatus;
    fixture.detectChanges();

    expect(component.getQueuesCount()).toBe(0);
    expect(component.getExchangesCount()).toBe(0);
  });

  it("should display error status", () => {
    const testStatus: RabbitMQStatus = {
      status: "error",
      connection: "error",
      error: "Connection timeout",
    };
    component.status = testStatus;
    fixture.detectChanges();

    expect(component.status.error).toBe("Connection timeout");
  });
});

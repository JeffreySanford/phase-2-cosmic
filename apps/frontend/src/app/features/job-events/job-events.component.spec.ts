import { ComponentFixture, TestBed } from "@angular/core/testing";
import { JobEventsComponent } from "./job-events.component";
import { BrokerEventsService } from "../../services/broker-events.service";
import { of } from "rxjs";

class StubBrokerService {
  events = of({ type: "test", payload: 1 });
}

describe("JobEventsComponent", () => {
  let component: JobEventsComponent;
  let fixture: ComponentFixture<JobEventsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [JobEventsComponent],
      providers: [
        { provide: BrokerEventsService, useClass: StubBrokerService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JobEventsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should render at least one event", () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector(".job-events p")?.textContent).toContain(
      "test"
    );
  });
});

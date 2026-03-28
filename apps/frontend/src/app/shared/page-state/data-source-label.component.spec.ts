import { ComponentFixture, TestBed } from "@angular/core/testing";
import { DataSourceLabelComponent } from "./data-source-label.component";
import { PageStateModule } from "./page-state.module";

describe("DataSourceLabelComponent", () => {
  let component: DataSourceLabelComponent;
  let fixture: ComponentFixture<DataSourceLabelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageStateModule],
    }).compileComponents();

    fixture = TestBed.createComponent(DataSourceLabelComponent);
    component = fixture.componentInstance;
    component.source = {
      label: "live",
      lastUpdated: new Date(Date.now() - 30_000).toISOString(),
    };
    fixture.detectChanges();
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  it("formats recent timestamps in seconds", () => {
    const ts = new Date(Date.now() - 20_000).toISOString();

    expect(component.formatTimestamp(ts)).toBe("20s ago");
  });

  it("formats medium-age timestamps in minutes", () => {
    const ts = new Date(Date.now() - 5 * 60_000).toISOString();

    expect(component.formatTimestamp(ts)).toBe("5m ago");
  });

  it("formats older timestamps in hours", () => {
    const ts = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

    expect(component.formatTimestamp(ts)).toBe("3h ago");
  });

  it("formats day-old timestamps as local dates", () => {
    const oldDate = new Date(Date.now() - 36 * 60 * 60_000);

    expect(component.formatTimestamp(oldDate.toISOString())).toBe(
      oldDate.toLocaleDateString()
    );
  });

  it("returns an empty string when date coercion throws", () => {
    const badTimestamp = {
      toString() {
        throw new Error("bad timestamp");
      },
    } as unknown as string;

    expect(component.formatTimestamp(badTimestamp)).toBe("");
  });
});

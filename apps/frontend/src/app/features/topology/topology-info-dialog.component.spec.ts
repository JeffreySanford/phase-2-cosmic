import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import {
  TopologyInfoDialogComponent,
  TopologyInfoDialogData,
} from "./topology-info-dialog.component";

describe("TopologyInfoDialogComponent", () => {
  let fixture: ComponentFixture<TopologyInfoDialogComponent>;
  let component: TopologyInfoDialogComponent;
  let dialogRef: { close: jest.Mock };

  async function configure(data: TopologyInfoDialogData) {
    dialogRef = { close: jest.fn() };

    await TestBed.configureTestingModule({
      declarations: [TopologyInfoDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(TopologyInfoDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("closes the dialog", async () => {
    await configure({
      type: "node",
      id: "node-1",
      label: "Node 1",
    });

    component.close();

    expect(dialogRef.close).toHaveBeenCalled();
  });

  it("marks throughput at or above 95% as critical", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { throughputPct: "95%" },
    });

    expect(component.isCritical()).toBe(true);
    expect(component.isHighUtil()).toBe(false);
    expect(component.isNormalUtil()).toBe(false);
  });

  it("marks throughput between 75% and 94% as high utilization", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { throughputPct: "82%" },
    });

    expect(component.isCritical()).toBe(false);
    expect(component.isHighUtil()).toBe(true);
    expect(component.isNormalUtil()).toBe(false);
  });

  it("marks throughput below 75% as normal utilization", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { throughputPct: "41%" },
    });

    expect(component.isCritical()).toBe(false);
    expect(component.isHighUtil()).toBe(false);
    expect(component.isNormalUtil()).toBe(true);
  });

  it("treats non-link data and malformed percentages as non-utilization states", async () => {
    await configure({
      type: "node",
      id: "node-2",
    });

    expect(component.isCritical()).toBe(false);
    expect(component.isHighUtil()).toBe(false);
    expect(component.isNormalUtil()).toBe(false);

    TestBed.resetTestingModule();
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { throughputPct: "n/a" },
    });

    expect(component.isCritical()).toBe(false);
    expect(component.isHighUtil()).toBe(false);
    expect(component.isNormalUtil()).toBe(false);
  });

  it("labels a measured link from its evidence state", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: {
        confidencePct: 95,
        state: "measured",
        measurementSource: "collector_messages_forwarded_total",
      },
    });

    expect(component.confidenceLabel()).toBe("Measured");
    expect(component.measurementSourceLabel()).toBe(
      "collector_messages_forwarded_total"
    );
  });

  it("reports absence rather than a confidence grade for an unmeasured link", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { confidencePct: null, state: "declared" },
    });

    expect(component.confidenceLabel()).toBe("No measurement");
    expect(component.measurementSourceLabel()).toBe("none");
  });

  it("never labels mock data as measured", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { confidencePct: null, state: "mock" },
    });

    expect(component.confidenceLabel()).toBe("Mock data");
  });

  it("shows no percentage when confidence is absent", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { confidencePct: null, state: "declared" },
    });

    // Number(null) is 0, which is finite, so an absent confidence would render
    // as "(0%)" if this were coerced rather than type-checked.
    expect(component.hasConfidenceScore()).toBe(false);
  });

  it("shows a percentage when a real measurement backs it", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { confidencePct: 95, state: "measured" },
    });

    expect(component.hasConfidenceScore()).toBe(true);
  });

  it("reports measurement age so a stale value cannot read as current", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: {
        confidencePct: 45,
        state: "stale",
        measuredAt: Date.now() - 5 * 60 * 1000,
      },
    });

    expect(component.measurementAgeLabel()).toBe("5m ago");
  });

  it("shows no age when nothing was measured", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { confidencePct: null, state: "declared" },
    });

    expect(component.measurementAgeLabel()).toBe("");
  });
});

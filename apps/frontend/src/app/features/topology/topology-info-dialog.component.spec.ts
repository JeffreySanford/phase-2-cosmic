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

  it("renders a confidence label from the link confidence score", async () => {
    await configure({
      type: "link",
      source: "a",
      target: "b",
      stats: { confidencePct: 92 },
    });

    expect(component.confidenceLabel()).toBe("High confidence");
  });
});

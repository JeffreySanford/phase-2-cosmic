import { LakehouseMetricsService } from "./lakehouse-metrics.service";

describe("LakehouseMetricsService", () => {
  it("stores and returns a typed summary", async () => {
    const service = new LakehouseMetricsService({ useMemory: true });

    const input = {
      source: "live" as const,
      bronzeState: "Bronze ingest active",
      silverQuality: "97.4% pass",
      goldReadiness: "Ready for analyst review",
      evidence: "ESO ObsCore proof slice",
      bronzePercent: 86,
      silverPercent: 72,
      goldPercent: 41,
      qualityFailureRate: 1.2,
      transferTimeEstimate: "~3.2 min",
    };

    await service.upsertSummary(input);
    const output = await service.getSummary();

    expect(output).toMatchObject(input);
  });

  it("reuses persisted data while fresh and refreshes when stale", async () => {
    const service = new LakehouseMetricsService({ useMemory: true });
    const initial = {
      source: "live" as const,
      bronzeState: "Bronze ingest active",
      silverQuality: "97.4% pass",
      goldReadiness: "Ready for analyst review",
      evidence: "ESO ObsCore proof slice",
      bronzePercent: 86,
      silverPercent: 72,
      goldPercent: 41,
      qualityFailureRate: 1.2,
      transferTimeEstimate: "~3.2 min",
    };

    await service.upsertSummary(initial);

    const freshResult = await service.getFreshSummary(async () => ({
      ...initial,
      bronzePercent: 91,
      silverPercent: 78,
      goldPercent: 46,
      qualityFailureRate: 0.9,
      transferTimeEstimate: "~2.5 min",
    }), { maxAgeMs: 60_000 });

    expect(freshResult.bronzePercent).toBe(86);
    expect(freshResult.transferTimeEstimate).toBe("~3.2 min");

    const repository = (service as unknown as { repository: { updatedAt: Date | null } }).repository;
    if (repository?.updatedAt) {
      repository.updatedAt = new Date(Date.now() - 5_000);
    }

    const staleResult = await service.getFreshSummary(async () => ({
      ...initial,
      bronzePercent: 95,
      silverPercent: 82,
      goldPercent: 50,
      qualityFailureRate: 0.7,
      transferTimeEstimate: "~1.8 min",
    }), { maxAgeMs: 1 });

    expect(staleResult.bronzePercent).toBe(95);
    expect(staleResult.transferTimeEstimate).toBe("~1.8 min");
  });
});

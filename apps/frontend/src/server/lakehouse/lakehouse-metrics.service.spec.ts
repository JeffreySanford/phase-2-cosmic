import { LakehouseMetricsService } from "./lakehouse-metrics.service";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("LakehouseMetricsService", () => {
  it("stores and returns a typed summary", async () => {
    const service = new LakehouseMetricsService({ useMemory: true });

    const input = {
      source: "live" as const,
      bronzeState: "Public source proof only; Bronze Delta not implemented",
      silverQuality:
        "Evidence state only; Silver quality tables not implemented",
      goldReadiness: "Gold readiness not implemented",
      evidence: "ESO ObsCore proof slice",
      bronzePercent: 0,
      silverPercent: 0,
      goldPercent: 0,
      qualityFailureRate: 0,
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
      bronzeState: "Public source proof only; Bronze Delta not implemented",
      silverQuality:
        "Evidence state only; Silver quality tables not implemented",
      goldReadiness: "Gold readiness not implemented",
      evidence: "ESO ObsCore proof slice",
      bronzePercent: 0,
      silverPercent: 0,
      goldPercent: 0,
      qualityFailureRate: 0,
      transferTimeEstimate: "~3.2 min",
    };

    await service.upsertSummary(initial);

    const freshResult = await service.getFreshSummary(
      async () => ({
        ...initial,
        bronzePercent: 91,
        silverPercent: 78,
        goldPercent: 46,
        qualityFailureRate: 0.9,
        transferTimeEstimate: "~2.5 min",
      }),
      { maxAgeMs: 60_000 }
    );

    expect(freshResult.bronzePercent).toBe(0);
    expect(freshResult.transferTimeEstimate).toBe("~3.2 min");

    const repository = (
      service as unknown as { repository: { updatedAt: Date | null } }
    ).repository;
    if (repository?.updatedAt) {
      repository.updatedAt = new Date(Date.now() - 5_000);
    }

    const staleResult = await service.getFreshSummary(
      async () => ({
        ...initial,
        bronzePercent: 95,
        silverPercent: 82,
        goldPercent: 50,
        qualityFailureRate: 0.7,
        transferTimeEstimate: "~1.8 min",
      }),
      { maxAgeMs: 1 }
    );

    expect(staleResult.bronzePercent).toBe(95);
    expect(staleResult.transferTimeEstimate).toBe("~1.8 min");
  });

  it("surfaces verified PR41 MVP medallion evidence when a manifest exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "lakehouse-pr41-"));
    const previousRoot = process.env["LAKEHOUSE_MVP_ROOT"];
    process.env["LAKEHOUSE_MVP_ROOT"] = root;

    try {
      writeFileSync(
        join(root, "manifest.json"),
        JSON.stringify({
          generatedAt: "2026-08-08T22:00:00Z",
          outputRoot: root,
          tables: {
            "bronze.observation_events": {
              path: "bronze/observation_events",
              rows: 5,
            },
            "silver.observations": {
              path: "silver/observations",
              rows: 3,
            },
            "silver.quarantine": {
              path: "silver/quarantine",
              rows: 2,
            },
            "gold.observation_summary": {
              path: "gold/observation_summary",
              rows: 1,
            },
          },
          evidence: {
            hasBronzeSourceFidelity: true,
            hasSilverCanonicalEntity: true,
            hasSilverQuarantine: true,
            hasGoldAggregate: true,
            lineage: "gold.lineage_bronze_event_ids -> bronze.bronze_event_id",
          },
        })
      );

      const service = new LakehouseMetricsService({ useMemory: true });
      const result = await service.getPublicEvidenceSummary();

      expect(result.bronzePercent).toBe(100);
      expect(result.silverPercent).toBe(100);
      expect(result.goldPercent).toBe(100);
      expect(result.qualityFailureRate).toBe(40);
      expect(result.upstream?.kind).toBe("pr41-local-mvp");
      expect(result.diagnostic?.state).toBe("local_mvp_verified");
      expect(result.diagnostic?.evidenceSource).toBe("pr41-local-manifest");
      expect(result.diagnostic?.activeProfile).toBe("tiny");
      expect(result.diagnostic?.medallionLayers?.bronze.rows).toBe(5);
      expect(result.diagnostic?.medallionLayers?.silver.rows).toBe(3);
      expect(result.diagnostic?.medallionLayers?.quarantine.rows).toBe(2);
      expect(result.diagnostic?.medallionLayers?.gold.rows).toBe(1);
      expect(result.bronzeState).toContain("PR41 MVP Bronze table verified");
      expect(result.goldReadiness).toContain(
        "PR41 MVP Gold aggregate verified"
      );
    } finally {
      if (previousRoot === undefined) {
        delete process.env["LAKEHOUSE_MVP_ROOT"];
      } else {
        process.env["LAKEHOUSE_MVP_ROOT"] = previousRoot;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("labels guarded large-profile manifests as generated stress diagnostics", async () => {
    const root = mkdtempSync(join(tmpdir(), "lakehouse-pr41-stress-"));
    const previousRoot = process.env["LAKEHOUSE_MVP_ROOT"];
    process.env["LAKEHOUSE_MVP_ROOT"] = root;

    try {
      writeFileSync(
        join(root, "manifest.json"),
        JSON.stringify({
          generatedAt: "2026-08-08T22:00:00Z",
          outputRoot: root,
          scaleProfile: {
            name: "10gb",
            requiresExplicitApproval: true,
          },
          largeProfilesAllowed: true,
          reproductionCommand:
            "LAKEHOUSE_ALLOW_LARGE_SAMPLE=true pnpm nx run lakehouse-mvp:run -- --profile 10gb",
          tables: {
            "bronze.observation_events": {
              path: "bronze/observation_events",
              rows: 5,
              bytes: 1024,
            },
            "silver.observations": {
              path: "silver/observations",
              rows: 3,
              bytes: 512,
            },
            "silver.quarantine": {
              path: "silver/quarantine",
              rows: 2,
              bytes: 256,
            },
            "gold.observation_summary": {
              path: "gold/observation_summary",
              rows: 1,
              bytes: 128,
            },
          },
          evidence: {
            hasBronzeSourceFidelity: true,
            hasSilverCanonicalEntity: true,
            hasSilverQuarantine: true,
            hasGoldAggregate: true,
          },
        })
      );

      const service = new LakehouseMetricsService({ useMemory: true });
      const result = await service.getPublicEvidenceSummary();

      expect(result.diagnostic?.state).toBe("generated_stress");
      expect(result.diagnostic?.evidenceSource).toBe(
        "generated-stress-manifest"
      );
      expect(result.diagnostic?.activeProfile).toBe("10gb");
      expect(result.diagnostic?.largeProfilesAllowed).toBe(true);
      expect(result.diagnostic?.medallionLayers?.bronze.bytes).toBe(1024);
      expect(result.diagnostic?.nextAction).toContain("manual stress run");
    } finally {
      if (previousRoot === undefined) {
        delete process.env["LAKEHOUSE_MVP_ROOT"];
      } else {
        process.env["LAKEHOUSE_MVP_ROOT"] = previousRoot;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});

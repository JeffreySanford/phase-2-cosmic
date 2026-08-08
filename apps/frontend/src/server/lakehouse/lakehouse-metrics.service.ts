import { Injectable } from "@nestjs/common";
import { Client } from "pg";

export type LakehouseSource = "live" | "fallback";

export interface LakehouseMetricsSummary {
  source: LakehouseSource;
  bronzeState: string;
  silverQuality: string;
  goldReadiness: string;
  evidence: string;
  bronzePercent: number;
  silverPercent: number;
  goldPercent: number;
  qualityFailureRate: number;
  transferTimeEstimate: string;
  upstream?: {
    kind: "eso-obscore" | "fallback";
    endpoint: string;
    query: string;
    rowCount: number;
  };
  persistedAt?: string;
  freshness?: {
    maxAgeMs: number;
    lastUpdatedAt?: string;
    stale: boolean;
  };
}

export interface LakehouseRepository {
  upsertSummary(summary: LakehouseMetricsSummary): Promise<void>;
  getSummary(): Promise<LakehouseMetricsSummary | null>;
  getLastUpdatedAt(): Promise<Date | null>;
}

class InMemoryLakehouseRepository implements LakehouseRepository {
  private summary: LakehouseMetricsSummary | null = null;
  private updatedAt: Date | null = null;

  async upsertSummary(summary: LakehouseMetricsSummary): Promise<void> {
    this.summary = {
      ...summary,
      persistedAt: new Date().toISOString(),
      freshness: {
        maxAgeMs: 15 * 60 * 1000,
        lastUpdatedAt: new Date().toISOString(),
        stale: false,
      },
    };
    this.updatedAt = new Date();
  }

  async getSummary(): Promise<LakehouseMetricsSummary | null> {
    if (!this.summary) {
      return null;
    }

    return {
      ...this.summary,
      persistedAt: this.summary.persistedAt ?? this.updatedAt?.toISOString(),
      freshness: {
        maxAgeMs: this.summary.freshness?.maxAgeMs ?? 15 * 60 * 1000,
        lastUpdatedAt:
          this.summary.freshness?.lastUpdatedAt ??
          this.updatedAt?.toISOString(),
        stale: false,
      },
    };
  }

  async getLastUpdatedAt(): Promise<Date | null> {
    return this.updatedAt ? new Date(this.updatedAt) : null;
  }
}

class PostgresLakehouseRepository implements LakehouseRepository {
  private readonly client: Client;
  private readonly initialized: Promise<void>;

  constructor(connectionString = process.env["FORGE_POSTGRES_URL"] || "") {
    this.client = new Client({ connectionString });
    this.initialized = this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.client.connectionParameters.connectionString) {
      return;
    }

    await this.client.connect();
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS lakehouse_metrics_summary (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        source TEXT NOT NULL,
        bronze_state TEXT NOT NULL,
        silver_quality TEXT NOT NULL,
        gold_readiness TEXT NOT NULL,
        evidence TEXT NOT NULL,
        bronze_percent INTEGER NOT NULL,
        silver_percent INTEGER NOT NULL,
        gold_percent INTEGER NOT NULL,
        quality_failure_rate DOUBLE PRECISION NOT NULL,
        transfer_time_estimate TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async upsertSummary(summary: LakehouseMetricsSummary): Promise<void> {
    await this.initialized;
    if (!this.client.connectionParameters.connectionString) {
      return;
    }

    await this.client.query(
      `
        INSERT INTO lakehouse_metrics_summary (
          id, source, bronze_state, silver_quality, gold_readiness, evidence,
          bronze_percent, silver_percent, gold_percent, quality_failure_rate,
          transfer_time_estimate, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          source = EXCLUDED.source,
          bronze_state = EXCLUDED.bronze_state,
          silver_quality = EXCLUDED.silver_quality,
          gold_readiness = EXCLUDED.gold_readiness,
          evidence = EXCLUDED.evidence,
          bronze_percent = EXCLUDED.bronze_percent,
          silver_percent = EXCLUDED.silver_percent,
          gold_percent = EXCLUDED.gold_percent,
          quality_failure_rate = EXCLUDED.quality_failure_rate,
          transfer_time_estimate = EXCLUDED.transfer_time_estimate,
          updated_at = NOW();
      `,
      [
        1,
        summary.source,
        summary.bronzeState,
        summary.silverQuality,
        summary.goldReadiness,
        summary.evidence,
        summary.bronzePercent,
        summary.silverPercent,
        summary.goldPercent,
        summary.qualityFailureRate,
        summary.transferTimeEstimate,
      ]
    );
  }

  async getSummary(): Promise<LakehouseMetricsSummary | null> {
    await this.initialized;
    if (!this.client.connectionParameters.connectionString) {
      return null;
    }

    const result = await this.client.query(
      `SELECT source, bronze_state, silver_quality, gold_readiness, evidence,
              bronze_percent, silver_percent, gold_percent, quality_failure_rate,
              transfer_time_estimate, updated_at
       FROM lakehouse_metrics_summary WHERE id = $1`,
      [1]
    );

    if (!result.rows.length) {
      return null;
    }

    const row = result.rows[0];
    return {
      source: row.source,
      bronzeState: row.bronze_state,
      silverQuality: row.silver_quality,
      goldReadiness: row.gold_readiness,
      evidence: row.evidence,
      bronzePercent: Number(row.bronze_percent),
      silverPercent: Number(row.silver_percent),
      goldPercent: Number(row.gold_percent),
      qualityFailureRate: Number(row.quality_failure_rate),
      transferTimeEstimate: row.transfer_time_estimate,
      persistedAt: row.updated_at
        ? new Date(row.updated_at).toISOString()
        : undefined,
      freshness: {
        maxAgeMs: 15 * 60 * 1000,
        lastUpdatedAt: row.updated_at
          ? new Date(row.updated_at).toISOString()
          : undefined,
        stale: false,
      },
    };
  }

  async getLastUpdatedAt(): Promise<Date | null> {
    await this.initialized;
    if (!this.client.connectionParameters.connectionString) {
      return null;
    }

    const result = await this.client.query(
      `SELECT updated_at FROM lakehouse_metrics_summary WHERE id = $1`,
      [1]
    );

    if (!result.rows.length) {
      return null;
    }

    return new Date(result.rows[0].updated_at);
  }
}

@Injectable()
export class LakehouseMetricsService {
  private readonly repository: LakehouseRepository;

  // Nest server service with explicit test seams; Angular inject() is not applicable here.
  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(options?: {
    repository?: LakehouseRepository;
    useMemory?: boolean;
  }) {
    if (options?.repository) {
      this.repository = options.repository;
      return;
    }

    if (options?.useMemory) {
      this.repository = new InMemoryLakehouseRepository();
      return;
    }

    this.repository = new PostgresLakehouseRepository();
  }

  async upsertSummary(summary: LakehouseMetricsSummary): Promise<void> {
    await this.repository.upsertSummary(summary);
  }

  async getSummary(): Promise<LakehouseMetricsSummary | null> {
    return this.repository.getSummary();
  }

  async getLastUpdatedAt(): Promise<Date | null> {
    return this.repository.getLastUpdatedAt();
  }

  async getFreshSummary(
    fetcher: () => Promise<LakehouseMetricsSummary>,
    options?: { maxAgeMs?: number }
  ): Promise<LakehouseMetricsSummary> {
    const maxAgeMs = options?.maxAgeMs ?? 15 * 60 * 1000;
    const lastUpdatedAt = await this.getLastUpdatedAt();
    const now = Date.now();

    const isFresh = Boolean(
      lastUpdatedAt && now - lastUpdatedAt.getTime() < maxAgeMs
    );
    if (isFresh) {
      const persisted = await this.getSummary();
      if (persisted) {
        return {
          ...persisted,
          freshness: {
            maxAgeMs,
            lastUpdatedAt:
              persisted.freshness?.lastUpdatedAt ?? persisted.persistedAt,
            stale: false,
          },
        };
      }
    }

    const fresh = await fetcher();
    const enriched = {
      ...fresh,
      upstream: fresh.upstream ?? {
        kind: "eso-obscore" as const,
        endpoint: "https://archive.eso.org/tap_obs",
        query: "SELECT TOP 5 ... FROM ivoa.ObsCore",
        rowCount: 5,
      },
      freshness: {
        maxAgeMs,
        lastUpdatedAt: new Date().toISOString(),
        stale: false,
      },
      persistedAt: new Date().toISOString(),
    };

    await this.upsertSummary(enriched);
    return enriched;
  }

  /**
   * Returns the current public-source proof without implying that Bronze,
   * Silver, or Gold Delta tables already exist. Repository failures are not
   * allowed to hide a successful public-source fetch, and stale persisted
   * evidence is used only when it already follows this proof-only contract.
   */
  async getPublicEvidenceSummary(options?: {
    maxAgeMs?: number;
  }): Promise<LakehouseMetricsSummary> {
    const maxAgeMs = options?.maxAgeMs ?? 15 * 60 * 1000;
    let persisted: LakehouseMetricsSummary | null = null;
    let lastUpdatedAt: Date | null = null;

    try {
      [persisted, lastUpdatedAt] = await Promise.all([
        this.getSummary(),
        this.getLastUpdatedAt(),
      ]);
    } catch (error) {
      console.warn(
        "Lakehouse evidence persistence unavailable; continuing with live source fetch:",
        error
      );
    }

    const persistedIsProofOnly = Boolean(
      persisted &&
        persisted.bronzePercent === 0 &&
        persisted.silverPercent === 0 &&
        persisted.goldPercent === 0 &&
        persisted.bronzeState.startsWith("Public source proof only")
    );
    const persistedIsFresh = Boolean(
      persistedIsProofOnly &&
        lastUpdatedAt &&
        Date.now() - lastUpdatedAt.getTime() < maxAgeMs
    );

    if (persisted && persistedIsFresh) {
      return {
        ...persisted,
        freshness: {
          maxAgeMs,
          lastUpdatedAt:
            persisted.freshness?.lastUpdatedAt ??
            persisted.persistedAt ??
            lastUpdatedAt?.toISOString(),
          stale: false,
        },
      };
    }

    try {
      const fresh = await this.fetchEsoPublicEvidence();
      const now = new Date().toISOString();
      const enriched: LakehouseMetricsSummary = {
        ...fresh,
        persistedAt: now,
        freshness: {
          maxAgeMs,
          lastUpdatedAt: now,
          stale: false,
        },
      };

      try {
        await this.upsertSummary(enriched);
      } catch (error) {
        console.warn(
          "Lakehouse live evidence collected but persistence failed:",
          error
        );
      }

      return enriched;
    } catch (error) {
      console.warn("ESO public-source evidence fetch failed:", error);

      if (persisted && persistedIsProofOnly) {
        return {
          ...persisted,
          freshness: {
            maxAgeMs,
            lastUpdatedAt:
              persisted.freshness?.lastUpdatedAt ?? persisted.persistedAt,
            stale: true,
          },
        };
      }

      return {
        source: "fallback",
        bronzeState:
          "Public source evidence unavailable; Bronze Delta not implemented",
        silverQuality: "Silver not implemented",
        goldReadiness: "Gold not implemented",
        evidence:
          "No trustworthy live or persisted public-source evidence is available",
        bronzePercent: 0,
        silverPercent: 0,
        goldPercent: 0,
        qualityFailureRate: 0,
        transferTimeEstimate: "n/a",
        upstream: {
          kind: "fallback",
          endpoint: "n/a",
          query: "n/a",
          rowCount: 0,
        },
        freshness: {
          maxAgeMs,
          lastUpdatedAt: undefined,
          stale: true,
        },
      };
    }
  }

  private async fetchEsoPublicEvidence(): Promise<LakehouseMetricsSummary> {
    const query =
      "SELECT TOP 5 obs_publisher_did, obs_collection, dataproduct_type, s_ra, s_dec, access_url FROM ivoa.ObsCore";
    const endpoint = "https://archive.eso.org/tap_obs";
    const url =
      `${endpoint}/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=` +
      encodeURIComponent(query);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `ESO ObsCore request failed with status ${response.status}`
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{
        obs_publisher_did?: string;
        obs_collection?: string;
        dataproduct_type?: string;
      }>;
    };
    const rows = payload.data ?? [];
    const collections = Array.from(
      new Set(rows.map((row) => row.obs_collection).filter(Boolean))
    ).join(", ");
    const dataTypes = Array.from(
      new Set(rows.map((row) => row.dataproduct_type).filter(Boolean))
    ).join(", ");

    return {
      source: "live",
      bronzeState: `Public source proof only (${rows.length} ESO ObsCore rows); Bronze Delta not implemented`,
      silverQuality:
        "Silver not implemented; canonical mapping remains a Stage 3 target",
      goldReadiness: "Gold not implemented",
      evidence: `${collections || "ESO ObsCore"} • ${
        dataTypes || "metadata rows"
      } • ${rows[0]?.obs_publisher_did ?? "sample row"}`,
      bronzePercent: 0,
      silverPercent: 0,
      goldPercent: 0,
      qualityFailureRate: 0,
      transferTimeEstimate: "n/a",
      upstream: {
        kind: "eso-obscore",
        endpoint,
        query,
        rowCount: rows.length,
      },
    };
  }
}

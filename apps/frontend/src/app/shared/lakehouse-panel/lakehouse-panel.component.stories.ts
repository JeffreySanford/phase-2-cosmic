import type { Meta, StoryObj } from "@storybook/angular";
import { LakehousePanelComponent } from "./lakehouse-panel.component";

const meta: Meta<LakehousePanelComponent> = {
  title: "Shared/LakehousePanel",
  component: LakehousePanelComponent,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<LakehousePanelComponent>;

export const Default: Story = {
  args: {
    summary: {
      source: "live",
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
      upstream: {
        kind: "eso-obscore",
        endpoint: "https://archive.eso.org/tap_obs",
        query: "SELECT TOP 5 ... FROM ivoa.ObsCore",
        rowCount: 5,
      },
      persistedAt: "2026-08-07T18:00:00.000Z",
      freshness: {
        maxAgeMs: 15 * 60 * 1000,
        lastUpdatedAt: "2026-08-07T18:05:00.000Z",
        stale: false,
      },
    },
  },
};

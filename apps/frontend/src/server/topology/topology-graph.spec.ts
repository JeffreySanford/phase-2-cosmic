// Mock vite before importing server.nest
jest.mock("vite", () => ({ createServer: jest.fn() }));
jest.mock("@angular/ssr", () => ({ CommonEngine: jest.fn() }));

import { AppController } from "../../../server.nest";
import { ForgeProxyService } from "../forge/forge-proxy.service";
import { GovernanceUpstreamService } from "../governance/governance-upstream.service";
import { GovernanceProxyService } from "../governance/governance-proxy.service";
import { EmbeddedMockBackendService } from "../mock/embedded-mock-backend.service";
import { LakehouseMetricsService } from "../lakehouse/lakehouse-metrics.service";

function makeController(): AppController {
  const ssr = { render: jest.fn() } as never;
  const upstream = new GovernanceUpstreamService();
  return new AppController(
    ssr,
    undefined,
    new ForgeProxyService(),
    upstream,
    new GovernanceProxyService(upstream),
    new EmbeddedMockBackendService(),
    new LakehouseMetricsService()
  );
}

function graph() {
  const controller = makeController();
  return controller.getTopology() as {
    nodes: Array<{ id: string; group: string; region?: string }>;
    links: Array<{ source: string; target: string; path?: string }>;
  };
}

function hasEdge(
  links: Array<{ source: string; target: string }>,
  source: string,
  target: string
): boolean {
  return links.some((l) => l.source === source && l.target === target);
}

describe("topology graph shape", () => {
  it("does not draw a direct pulsar to kafka edge", () => {
    // Nothing in the codebase bridges Pulsar to Kafka without a collector.
    // This edge was drawn for a long time while no such bridge existed.
    const { links } = graph();

    expect(hasEdge(links, "pulsar", "kafka")).toBe(false);
  });

  it("routes each region through its own collector to kafka", () => {
    const { links } = graph();

    for (const region of ["us", "eu", "apac"]) {
      expect(hasEdge(links, "data-generator", `pulsar-${region}`)).toBe(true);
      expect(hasEdge(links, `pulsar-${region}`, `collector-${region}`)).toBe(
        true
      );
      expect(hasEdge(links, `collector-${region}`, "kafka")).toBe(true);
    }
  });

  it("draws the presentation path through to the frontend", () => {
    const { links } = graph();

    expect(hasEdge(links, "kafka", "java-ingest")).toBe(true);
    expect(hasEdge(links, "java-ingest", "backend")).toBe(true);
    expect(hasEdge(links, "backend", "frontend")).toBe(true);
  });

  it("marks governance fan-in distinctly from the transport chain", () => {
    const { links } = graph();

    const governanceEdges = links.filter((l) => l.target === "java-governance");
    const brokerFanIn = governanceEdges.filter((l) =>
      ["kafka", "pulsar", "rabbitmq"].includes(l.source)
    );

    expect(brokerFanIn.length).toBe(3);
    for (const edge of brokerFanIn) {
      expect(edge.path).toBe("governance");
    }
  });

  it("keeps rabbitmq out of the transport chain", () => {
    const { links } = graph();

    const rabbitTransport = links.filter(
      (l) =>
        l.path === "transport" &&
        (l.source === "rabbitmq" || l.target === "rabbitmq")
    );

    expect(rabbitTransport).toHaveLength(0);
  });

  it("declares a node for every endpoint referenced by an edge", () => {
    // Guards against an edge naming a component that does not exist in the
    // graph, which is how an aspirational link gets drawn unnoticed.
    const { nodes, links } = graph();
    const ids = new Set(nodes.map((n) => n.id));

    for (const link of links) {
      expect(ids.has(link.source)).toBe(true);
      expect(ids.has(link.target)).toBe(true);
    }
  });

  it("gives every regional edge node a region", () => {
    const { nodes } = graph();
    const edgeNodes = nodes.filter((n) => n.group === "edge");

    expect(edgeNodes.length).toBe(6);
    for (const node of edgeNodes) {
      expect(node.region).toBeTruthy();
    }
  });
});

import { TestBed } from "@angular/core/testing";
import { BrowserPlatformService } from "./browser-platform.service";
import {
  TopologyDomService,
  TopologyRenderConfig,
} from "./topology-dom.service";
import { TopoLink, TopoNode } from "../features/topology/topology.types";

describe("TopologyDomService", () => {
  let service: TopologyDomService;
  let container: HTMLDivElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BrowserPlatformService, TopologyDomService],
    });
    service = TestBed.inject(TopologyDomService);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("can initialize and render a minimal topology graph with DOM output", async () => {
    // Ensure fallback D3 stub still creates actual SVG DOM elements in tests.
    await service.initGraph(container);

    const nodes: TopoNode[] = [{ id: "n1" }];
    const links: TopoLink[] = [];

    const config: TopologyRenderConfig = {
      nodes,
      links,
      getLinkKey: (l) =>
        `${typeof l.source === "string" ? l.source : l.source.id}->${
          typeof l.target === "string" ? l.target : l.target.id
        }`,
      getLinkSource: (l) =>
        typeof l.source === "string" ? l.source : l.source.id,
      getLinkStats: () => undefined,
      getLinkStroke: () => ({ stroke: "#000", dasharray: "0", width: 1 }),
      getLinkDotStyle: () => ({ fill: "#000", stroke: "#000", radius: 1 }),
      getNodeRingStyle: () => ({ radius: 1, fill: "#000", stroke: "#000" }),
      getNodeLabel: (n) => n.label ?? n.id,
      getNodeActivityLabel: () => "",
    };

    expect(() => service.renderGraph(config)).not.toThrow();

    const svg = service["svg"]?.node?.() as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(() => service.stopSimulation()).not.toThrow();
  });

  it("attaches begin/end listeners to particle animations so flashes sync to travel", () => {
    const layer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    ) as SVGGElement;

    const onEmit = jest.fn();
    const onReceive = jest.fn();

    // 2 particles => begin at 0s and 0.5s; duration 1s => end at 1s and 1.5s
    service.syncParticlesForLink(
      layer,
      "a->b",
      2,
      1,
      1,
      "#000",
      0,
      onEmit,
      onReceive
    );

    const anims = Array.from(
      layer.querySelectorAll<SVGAnimateMotionElement>("animateMotion")
    );
    expect(anims).toHaveLength(2);

    expect(anims[0].getAttribute("begin")).toBe("0s");
    expect(anims[0].getAttribute("dur")).toBe("1s");
    expect(anims[1].getAttribute("begin")).toBe("0.5s");
    expect(anims[1].getAttribute("dur")).toBe("1s");

    anims[0].dispatchEvent(new Event("beginEvent"));
    anims[0].dispatchEvent(new Event("endEvent"));
    anims[1].dispatchEvent(new Event("beginEvent"));
    anims[1].dispatchEvent(new Event("endEvent"));

    expect(onEmit).toHaveBeenCalledTimes(2);
    expect(onReceive).toHaveBeenCalledTimes(2);
  });
});

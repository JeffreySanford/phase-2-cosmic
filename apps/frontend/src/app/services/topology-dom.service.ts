import { ElementRef, Injectable, inject } from "@angular/core";
import { BrowserPlatformService } from "./browser-platform.service";
import {
  D3Drag,
  D3DragEvent,
  D3Module,
  D3Selection,
  D3Simulation,
  LinkStats,
  NodeSummary,
  TopoLink,
  TopoNode,
} from "../features/topology/topology.types";

export interface TopologyRenderConfig {
  nodes: TopoNode[];
  links: TopoLink[];
  getLinkKey: (link: TopoLink) => string;
  getLinkSource: (link: TopoLink) => string;
  getLinkStats: (link: TopoLink) => LinkStats | undefined;
  getLinkStroke: (
    link: TopoLink,
    stats?: LinkStats
  ) => {
    stroke: string;
    dasharray: string;
    width: number;
  };
  getLinkDotStyle: (
    link: TopoLink,
    stats?: LinkStats
  ) => {
    fill: string;
    stroke: string;
    radius: number;
  };
  getNodeRingStyle: (
    node: TopoNode,
    summary?: NodeSummary
  ) => {
    radius: number;
    fill: string;
    stroke: string;
  };
  getNodeFill?: (node: TopoNode, summary?: NodeSummary) => string;
  getNodeFillOpacity?: (node: TopoNode, summary?: NodeSummary) => number;
  getNodeCoreClass?: (
    node: TopoNode,
    summary?: NodeSummary
  ) => string | undefined;
  getNodeLabel: (node: TopoNode) => string;
  getNodeSummary?: (node: TopoNode) => NodeSummary | undefined;
  getNodeActivityLabel: (node: TopoNode, summary?: NodeSummary) => string;
  getNodePulseDelayMs?: (node: TopoNode) => number;
  onLinkClick?: (link: TopoLink) => void;
  onNodeClick?: (node: TopoNode) => void;

  onNodeDragStart?: (event: D3DragEvent, node: TopoNode) => void;
  onNodeDrag?: (event: D3DragEvent, node: TopoNode) => void;
  onNodeDragEnd?: (event: D3DragEvent, node: TopoNode) => void;
}

let _d3: D3Module | null = null;

@Injectable({ providedIn: "root" })
export class TopologyDomService {
  private readonly browser = inject(BrowserPlatformService);

  private d3: D3Module | null = null;
  private svg?: D3Selection | null;
  private viewportGroup?: D3Selection | null;
  private simulation?: D3Simulation | null;

  private getDocument(): Document | null {
    return this.browser.window?.document ?? null;
  }

  /** Convert a topology link key into a valid DOM id fragment. */
  safeId(s: string): string {
    return "path_" + s.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  async initGraph(container: HTMLElement): Promise<void> {
    await this.loadD3();
    if (!this.d3) return;

    const w = container.clientWidth || 800;
    const h = Math.max(360, container.clientHeight || 480);

    this.svg = this.d3
      .select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", h)
      .attr("viewBox", `0 0 ${w} ${h}`)
      // Use `slice` so that the force graph fills the container without leaving empty margins
      .attr("preserveAspectRatio", "xMidYMid slice");

    this.viewportGroup = this.svg.append("g").attr("class", "viewport");
  }

  private async loadD3(): Promise<D3Module> {
    if (this.d3) return this.d3;
    if (_d3) {
      this.d3 = _d3;
      return this.d3;
    }

    try {
      const mod = await import("d3");
      _d3 = mod;
      this.d3 = mod;
      return mod;
    } catch {
      // fallback: minimal d3-like DOM helper for tests.
      class DomSelection implements D3Selection {
        constructor(public el: Element) {}
        append(tag: string): D3Selection {
          const child = this.el.ownerDocument.createElementNS(
            "http://www.w3.org/2000/svg",
            tag
          );
          this.el.appendChild(child);
          return new DomSelection(child);
        }
        attr(name: string, value?: unknown): D3Selection {
          if (value !== undefined && this.el instanceof Element) {
            this.el.setAttribute(name, String(value));
          }
          return this;
        }
        select(_sel?: string): D3Selection {
          return this;
        }
        selectAll(_sel: string): D3Selection {
          return this;
        }
        data(_d: unknown[]): D3Selection {
          return this;
        }
        enter(): D3Selection {
          return this;
        }
        call(fn: ((sel: D3Selection) => void) | unknown): D3Selection {
          if (typeof fn === "function") {
            fn(this);
          }
          return this;
        }
        text(t?: unknown): D3Selection {
          if (t !== undefined) {
            this.el.textContent = String(t);
          }
          return this;
        }
        remove(): void {
          this.el.remove();
        }
        node(): Element {
          return this.el;
        }
      }

      const dragStub: D3Drag = {
        on: (
          _ev: string,
          _handler: (event: D3DragEvent, d: TopoNode) => void
        ) => dragStub,
      };

      const simStub: D3Simulation = {
        stop: () => simStub,
        alpha: (_n: number) => simStub,
        alphaDecay: (_n: number) => simStub,
        alphaTarget: (_n: number) => simStub,
        restart: () => simStub,
        velocityDecay: (_n: number) => simStub,
        on: (_ev: string, _cb: () => void) => simStub,
        force: (_name: string, _f: unknown) => simStub,
      };

      this.d3 = {
        select: (el: Element | HTMLElement) => new DomSelection(el),
        drag: () => dragStub,
        forceSimulation: (_nodes: TopoNode[]) => simStub,
        forceLink: (_links: TopoLink[]) => ({
          id: () => ({ distance: () => ({}) }),
        }),
        forceCollide: (_radius: number) => ({ strength: () => ({}) }),
        forceManyBody: () => ({ strength: () => ({}) }),
        forceCenter: (_x: number, _y: number) => ({}),
      };
      return this.d3;
    }
  }

  stopSimulation(): void {
    this.simulation?.stop();
    this.simulation = undefined;
  }

  setViewportTransform(scale: number, x: number, y: number): void {
    this.viewportGroup?.attr(
      "transform",
      `translate(${x},${y}) scale(${scale})`
    );
  }

  setSimulationAlphaTarget(target: number): void {
    this.simulation?.alphaTarget(target).restart?.();
  }

  setNodeFixedPosition(node: TopoNode, x: number, y: number): void {
    node.fx = x;
    node.fy = y;
  }

  releaseNodePosition(node: TopoNode): void {
    node.fx = null;
    node.fy = null;
  }

  clear(): void {
    this.svg?.selectAll("*").remove?.();
    this.stopSimulation();
  }

  renderGraph(config: TopologyRenderConfig): void {
    if (!this.svg || !this.d3) return;

    this.stopSimulation();
    this.svg.selectAll("*").remove?.();

    const container = this.svg?.node?.()?.parentElement as HTMLElement | null;
    const w = container?.clientWidth || 800;
    const h = Math.max(360, container?.clientHeight || 480);
    this.svg.attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);

    this.viewportGroup = this.svg.append("g").attr("class", "viewport");
    const linkGroup = this.viewportGroup.append("g").attr("class", "links");
    this.viewportGroup.append("g").attr("class", "flow-particles");
    const nodeGroup = this.viewportGroup.append("g").attr("class", "nodes");

    const d3 = this.d3 as D3Module;

    const link = linkGroup
      .selectAll("line")
      .data(config.links)
      .enter()
      .append("line")
      .attr("data-key", (ln: TopoLink) => config.getLinkKey(ln))
      .attr("data-source", (ln: TopoLink) => config.getLinkSource(ln))
      .attr(
        "stroke",
        (ln: TopoLink) =>
          config.getLinkStroke(ln, config.getLinkStats(ln)).stroke
      )
      .attr(
        "stroke-dasharray",
        (ln: TopoLink) =>
          config.getLinkStroke(ln, config.getLinkStats(ln)).dasharray
      )
      .attr(
        "stroke-width",
        (ln: TopoLink) =>
          config.getLinkStroke(ln, config.getLinkStats(ln)).width
      );

    const linkDot = linkGroup
      .selectAll(".link-dot")
      .data(config.links)
      .enter()
      .append("circle")
      .attr("class", "link-dot")
      .attr("data-key", (ln: TopoLink) => config.getLinkKey(ln))
      .attr("data-source", (ln: TopoLink) => config.getLinkSource(ln))
      .attr(
        "r",
        (ln: TopoLink) =>
          config.getLinkDotStyle(ln, config.getLinkStats(ln)).radius
      )
      .attr(
        "fill",
        (ln: TopoLink) =>
          config.getLinkDotStyle(ln, config.getLinkStats(ln)).fill
      )
      .attr(
        "stroke",
        (ln: TopoLink) =>
          config.getLinkDotStyle(ln, config.getLinkStats(ln)).stroke
      )
      .attr("stroke-width", 1)
      .attr("style", "cursor:pointer")
      .call((s: D3Selection) => {
        if (s.on && config.onLinkClick)
          s.on("click", (_ev: unknown, datum: unknown) =>
            config.onLinkClick?.(datum as TopoLink)
          );
      });

    const path = linkGroup
      .selectAll(".link-path")
      .data(config.links)
      .enter()
      .append("path")
      .attr("class", "link-path")
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("data-key", (ln: TopoLink) => config.getLinkKey(ln))
      .attr("id", (ln: TopoLink) => this.safeId(config.getLinkKey(ln)));

    // create per-link flow particles
    try {
      const particleLayerEl = this.browser.querySelector<SVGGElement>(
        this.svg?.node?.() as Element | null,
        "g.flow-particles"
      );
      if (particleLayerEl) {
        this.clearFlowParticles(particleLayerEl);
        for (const ln of config.links) {
          const key = config.getLinkKey(ln);
          const stats = config.getLinkStats(ln);
          const style = this.getParticleStyle(stats);
          this.syncParticlesForLink(
            particleLayerEl,
            key,
            style.count,
            style.duration,
            style.radius,
            style.fill
          );
        }
      }
    } catch {
      // ignore
    }

    const node = nodeGroup
      .selectAll("g")
      .data(config.nodes)
      .enter()
      .append("g")
      .call((sel: D3Selection) => {
        const dragger = d3.drag();
        if (config.onNodeDragStart) {
          dragger.on("start", config.onNodeDragStart);
        }
        if (config.onNodeDrag) {
          dragger.on("drag", config.onNodeDrag);
        }
        if (config.onNodeDragEnd) {
          dragger.on("end", config.onNodeDragEnd);
        }
        sel.call(dragger);
      });

    node
      .append("circle")
      .attr("class", "node-ring")
      .attr(
        "r",
        (d: TopoNode) =>
          config.getNodeRingStyle(d, config.getNodeSummary?.(d)).radius
      )
      .attr(
        "fill",
        (d: TopoNode) =>
          config.getNodeRingStyle(d, config.getNodeSummary?.(d)).fill
      )
      .attr("fill-opacity", 0.18)
      .attr(
        "stroke",
        (d: TopoNode) =>
          config.getNodeRingStyle(d, config.getNodeSummary?.(d)).stroke
      )
      .attr("stroke-width", 1.4);

    node
      .append("circle")
      .attr("class", (d: TopoNode) => {
        const base = "node-core";
        const extra = config.getNodeCoreClass?.(d, config.getNodeSummary?.(d));
        return extra ? `${base} ${extra}` : base;
      })
      .attr("r", 14)
      .attr(
        "fill",
        (d: TopoNode) =>
          config.getNodeFill?.(d, config.getNodeSummary?.(d)) ??
          "rgba(148, 163, 184, 0.35)"
      )
      .attr(
        "fill-opacity",
        (d: TopoNode) =>
          config.getNodeFillOpacity?.(d, config.getNodeSummary?.(d)) ?? 0.3
      )
      .attr("stroke", "#0f172a")
      .call((s: D3Selection) => {
        if (s.on) {
          s.on("animationend", function (this: HTMLElement) {
            const el = this as HTMLElement;
            el.classList.remove(
              "node-core--pulse",
              "node-core--pulse--receive",
              "node-core--pulse--emit",
              "node-core--pulse--both"
            );
          });
        }
      });

    node
      .append("text")
      .attr("x", 18)
      .attr("y", 4)
      .attr("font-size", 12)
      .attr("fill", "#f8fafc")
      .attr("font-weight", 600)
      .attr("paint-order", "stroke")
      .attr("stroke", "rgba(2, 6, 23, 0.9)")
      .attr("stroke-width", 3)
      .attr("stroke-linejoin", "round")
      .text((d: TopoNode) => config.getNodeLabel(d));

    node
      .append("text")
      .attr("class", "node-activity")
      .attr("x", 18)
      .attr("y", 18)
      .attr("font-size", 10)
      .attr("fill", (d: TopoNode) =>
        config.getNodeActivityLabel(d, config.getNodeSummary?.(d))
      )
      .attr("font-weight", 700)
      .attr("paint-order", "stroke")
      .attr("stroke", "rgba(2, 6, 23, 0.92)")
      .attr("stroke-width", 3)
      .attr("stroke-linejoin", "round")
      .text((d: TopoNode) =>
        config.getNodeActivityLabel(d, config.getNodeSummary?.(d))
      );

    this.simulation = d3
      .forceSimulation(config.nodes)
      .force(
        "link",
        d3
          .forceLink(config.links)
          .id((d: TopoNode) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-280))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collide", d3.forceCollide(44).strength(0.7))
      .alpha(0.22)
      .alphaDecay(0.16)
      .velocityDecay(0.4)
      .on("tick", () => {
        link.attr("x1", (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          return s.x ?? 0;
        });
        link.attr("y1", (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          return s.y ?? 0;
        });
        link.attr("x2", (ln: TopoLink) => {
          const t = ln.target as TopoNode;
          return t.x ?? 0;
        });
        link.attr("y2", (ln: TopoLink) => {
          const t = ln.target as TopoNode;
          return t.y ?? 0;
        });

        path.attr("d", (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          const t = ln.target as TopoNode;
          const sx = Math.round(s.x ?? 0);
          const sy = Math.round(s.y ?? 0);
          const tx = Math.round(t.x ?? 0);
          const ty = Math.round(t.y ?? 0);
          return `M ${sx} ${sy} L ${tx} ${ty}`;
        });

        // update particle element positions/durations if needed (best-effort)
        try {
          const particleLayerEl = this.browser.querySelector<SVGGElement>(
            this.svg?.node?.() as Element | null,
            "g.flow-particles"
          );
          if (particleLayerEl) {
            for (const ln of config.links) {
              const key = config.getLinkKey(ln);
              const stats = config.getLinkStats(ln);
              const style = this.getParticleStyle(stats);
              this.syncParticlesForLink(
                particleLayerEl,
                key,
                style.count,
                style.duration,
                style.radius,
                style.fill
              );
            }
          }
        } catch {
          // ignore
        }

        node.attr(
          "transform",
          (nd: TopoNode) => `translate(${nd.x ?? 0},${nd.y ?? 0})`
        );

        if (linkDot) {
          linkDot.attr("cx", (ln: TopoLink) => {
            const s = ln.source as TopoNode;
            const t = ln.target as TopoNode;
            const sx = s.x ?? 0;
            const tx = t.x ?? 0;
            return (sx + tx) / 2;
          });
          linkDot.attr("cy", (ln: TopoLink) => {
            const s = ln.source as TopoNode;
            const t = ln.target as TopoNode;
            const sy = s.y ?? 0;
            const ty = t.y ?? 0;
            return (sy + ty) / 2;
          });
        }
      });
  }

  refreshGraphStyles(config: TopologyRenderConfig): void {
    const svgEl = this.svg?.node?.() as SVGSVGElement | null;
    if (!svgEl) return;

    const linkByKey = new Map<string, TopoLink>();
    for (const link of config.links) {
      linkByKey.set(config.getLinkKey(link), link);
    }

    const updateLink = (el: Element | null) => {
      const key = el?.getAttribute("data-key");
      if (!key) return;
      const link = linkByKey.get(key);
      if (!link) return;
      const stats = config.getLinkStats(link);
      const stroke = config.getLinkStroke(link, stats);
      el?.setAttribute("stroke", stroke.stroke);
      el?.setAttribute("stroke-dasharray", stroke.dasharray);
      el?.setAttribute("stroke-width", `${stroke.width}`);
      const source = config.getLinkSource(link);
      if (source) {
        el?.setAttribute("data-source", source);
      }
    };

    svgEl
      .querySelectorAll<SVGLineElement>("g.links line[data-key]")
      .forEach((line) => updateLink(line));

    svgEl
      .querySelectorAll<SVGCircleElement>("g.links circle.link-dot[data-key]")
      .forEach((dot) => {
        const key = dot.getAttribute("data-key");
        if (!key) return;
        const link = linkByKey.get(key);
        if (!link) return;
        const stats = config.getLinkStats(link);
        const style = config.getLinkDotStyle(link, stats);
        dot.setAttribute("r", `${style.radius}`);
        dot.setAttribute("fill", style.fill);
        dot.setAttribute("stroke", style.stroke);
        const source = config.getLinkSource(link);
        if (source) {
          dot.setAttribute("data-source", source);
        }
      });

    svgEl.querySelectorAll<SVGGElement>("g.nodes > g").forEach((group) => {
      const node = (group as unknown as { __data__?: TopoNode }).__data__;
      if (!node) return;
      const summary = config.getNodeSummary?.(node);

      const ring = group.querySelector<SVGCircleElement>("circle.node-ring");
      if (ring) {
        const ringStyle = config.getNodeRingStyle(node, summary);
        ring.setAttribute("r", `${ringStyle.radius}`);
        ring.setAttribute("fill", ringStyle.fill);
        ring.setAttribute("stroke", ringStyle.stroke);
      }

      const core = group.querySelector<SVGCircleElement>("circle.node-core");
      if (core) {
        const base = "node-core";
        const extra = config.getNodeCoreClass?.(node, summary);
        core.setAttribute("class", extra ? `${base} ${extra}` : base);

        // allow per-node pulse staggering so active nodes don't all flash in sync
        const delayMs = config.getNodePulseDelayMs?.(node);
        if (delayMs != null) {
          core.style.setProperty("--node-pulse-delay", `${delayMs}ms`);
        }

        // remove pulse class after animation completes so it can be re-applied later
        if (extra?.includes("node-core--pulse")) {
          this.ensurePulseCleanup(core);
        }

        if (config.getNodeFill) {
          core.setAttribute("fill", config.getNodeFill(node, summary));
        }
        if (config.getNodeFillOpacity) {
          core.setAttribute(
            "fill-opacity",
            `${config.getNodeFillOpacity(node, summary)}`
          );
        }
      }

      const activity =
        group.querySelector<SVGTextElement>("text.node-activity");
      if (activity) {
        activity.textContent = config.getNodeActivityLabel(node, summary);
      }
    });
  }

  private getParticleStyle(stats?: LinkStats) {
    const util = stats ? Number(stats.throughputPctNumeric) || 0 : 0;
    const count =
      util >= 90 ? 5 : util >= 70 ? 4 : util >= 45 ? 3 : util >= 20 ? 2 : 1;
    const duration = Math.max(0.45, 4.8 - util / 22);
    const radius = util >= 90 ? 5.5 : util >= 60 ? 4.8 : util >= 30 ? 4.2 : 3.6;
    const fill =
      util >= 90
        ? "#2563eb"
        : util >= 65
        ? "#1d4ed8"
        : util >= 35
        ? "#3b82f6"
        : "#60a5fa";
    return { count, duration, radius, fill };
  }

  private ensurePulseCleanup(core: SVGCircleElement): void {
    const key = "pulseCleanupAttached";
    if (core.dataset[key]) return;

    const listener = () => {
      core.classList.remove(
        "node-core--pulse",
        "node-core--pulse--receive",
        "node-core--pulse--emit",
        "node-core--pulse--both"
      );
      core.style.removeProperty("--node-pulse-delay");
      core.removeEventListener("animationend", listener);
      delete core.dataset[key];
    };

    core.addEventListener("animationend", listener);
    core.dataset[key] = "true";
  }

  getSvgElement(
    container?: ElementRef<HTMLElement> | HTMLElement | null
  ): SVGSVGElement | null {
    const el =
      container && (container as ElementRef<HTMLElement>).nativeElement
        ? (container as ElementRef<HTMLElement>).nativeElement
        : (container as HTMLElement | null);
    return this.browser.querySelector<SVGSVGElement>(el, "svg");
  }

  getParticleLayerElement(
    container?: ElementRef<HTMLElement> | HTMLElement | null
  ): SVGGElement | null {
    const el =
      container && (container as ElementRef<HTMLElement>).nativeElement
        ? (container as ElementRef<HTMLElement>).nativeElement
        : (container as HTMLElement | null);
    return this.browser.querySelector<SVGGElement>(
      el,
      "g.viewport g.flow-particles"
    );
  }

  getGraphShellElement(
    container?: ElementRef<HTMLElement> | HTMLElement | null
  ): HTMLElement | null {
    const el =
      container && (container as ElementRef<HTMLElement>).nativeElement
        ? (container as ElementRef<HTMLElement>).nativeElement
        : (container as HTMLElement | null);
    return el?.closest?.(".topology-graph-shell") as HTMLElement | null;
  }

  private clearFlowParticles(layer: SVGGElement): void {
    while (layer.firstChild) {
      layer.removeChild(layer.firstChild);
    }
  }

  public syncParticlesForLink(
    layer: SVGGElement,
    key: string,
    count: number,
    duration: number,
    radius: number,
    fill: string,
    phaseSec = 0,
    onEmit?: () => void,
    onReceive?: () => void
  ): void {
    const existing = Array.from(
      layer.querySelectorAll<SVGCircleElement>(
        `.flow-particle[data-key="${key}"]`
      )
    );
    existing.slice(count).forEach((el) => el.remove());

    const doc = this.getDocument();
    if (!doc) return;

    for (let i = existing.length; i < count; i += 1) {
      const circle = this.browser.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      ) as SVGCircleElement | null;
      if (!circle) continue;
      circle.setAttribute("class", "flow-particle");
      circle.setAttribute("data-key", key);

      const anim = this.browser.createElementNS(
        "http://www.w3.org/2000/svg",
        "animateMotion"
      ) as SVGAnimateMotionElement | null;
      if (anim) {
        anim.setAttribute("repeatCount", "indefinite");
        anim.setAttribute("rotate", "auto");

        const beginSec = phaseSec + (i * duration) / count;
        anim.setAttribute("begin", `${beginSec}s`);

        const mpath = this.browser.createElementNS(
          "http://www.w3.org/2000/svg",
          "mpath"
        );
        if (mpath) {
          mpath.setAttribute("href", `#${this.safeId(key)}`);
          anim.appendChild(mpath);
        }

        if (onEmit && !anim.dataset["emitAttached"]) {
          anim.addEventListener("beginEvent", () => {
            onEmit();
          });
          anim.dataset["emitAttached"] = "true";
        }

        if (onReceive && !anim.dataset["receiveAttached"]) {
          anim.addEventListener("endEvent", () => {
            onReceive();
          });
          anim.dataset["receiveAttached"] = "true";
        }

        circle.appendChild(anim);
      }

      layer.appendChild(circle);
    }

    Array.from(
      layer.querySelectorAll<SVGCircleElement>(
        `.flow-particle[data-key="${key}"]`
      )
    ).forEach((el, idx) => {
      el.setAttribute("r", `${radius}`);
      el.setAttribute("fill", fill);
      el.setAttribute("opacity", `${Math.max(0.38, 0.95 - idx * 0.12)}`);

      const anim = el.querySelector<SVGAnimateMotionElement>("animateMotion");
      if (anim) {
        anim.setAttribute("dur", `${duration}s`);
        const beginSec = phaseSec + (idx * duration) / count;
        anim.setAttribute("begin", `${beginSec}s`);
      }
    });
  }

  animatePulse(svgEl: SVGSVGElement | null, key: string): void {
    if (!svgEl) return;
    const line = this.browser.querySelector<SVGLineElement>(
      svgEl,
      `line[data-key="${key}"]`
    );
    if (!line) return;

    const original = line.getAttribute("stroke");
    const anim = line.animate(
      [
        { stroke: original ?? "#bdbdbd", strokeWidth: "1px" },
        { stroke: "#fde047", strokeWidth: "2.5px" },
        { stroke: original ?? "#bdbdbd", strokeWidth: "1px" },
      ],
      { duration: 650, easing: "ease-in-out" }
    );
    anim.onfinish = () => {
      try {
        line.setAttribute("stroke", original || "#bdbdbd");
        line.setAttribute("stroke-width", "1");
      } catch {
        // ignore
      }
    };
  }

  flashLine(svgEl: SVGSVGElement | null, key: string): void {
    if (!svgEl) return;
    const line = this.browser.querySelector<SVGLineElement>(
      svgEl,
      `line[data-key="${key}"]`
    );
    if (!line) return;
    const original = line.getAttribute("stroke");

    const anim = line.animate(
      [
        { stroke: original ?? "#bdbdbd", strokeWidth: "1px" },
        { stroke: "#fffbeb", strokeWidth: "4px" },
        { stroke: original ?? "#bdbdbd", strokeWidth: "1px" },
      ],
      { duration: 800, easing: "ease-in-out" }
    );
    anim.onfinish = () => {
      try {
        line.setAttribute("stroke", original || "#bdbdbd");
        line.setAttribute("stroke-width", "1");
      } catch {
        // ignore
      }
    };
  }
}

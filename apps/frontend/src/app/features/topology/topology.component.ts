import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
// d3 is ESM; load dynamically at runtime to avoid Jest/node transform issues
let _d3: D3Module | null = null;

type TopoNode = { id: string; label?: string; group?: string; x?: number; y?: number; fx?: number | null; fy?: number | null };
type TopoLink = { source: string | TopoNode; target: string | TopoNode; value?: number };

type D3DragEvent = { x: number; y: number; subject?: unknown; active?: number };

type D3Selection = {
  append: (tag: string) => D3Selection;
  attr: (name: string, value?: unknown) => D3Selection;
  select: (sel?: string) => D3Selection;
  selectAll: (sel: string) => D3Selection;
  data: (d: unknown[]) => D3Selection;
  enter: () => D3Selection;
  call: (fn: ((sel: D3Selection) => void) | unknown) => D3Selection;
  on?: (event: string, handler: (event?: unknown, datum?: unknown) => void) => void;
  text: (t?: unknown) => D3Selection;
  remove?: () => void;
};

type D3Drag = { on: (ev: string, handler: (event: D3DragEvent, d: TopoNode) => void) => D3Drag };

type D3Simulation = {
  stop: () => void;
  alphaTarget: (n: number) => D3Simulation;
  restart?: () => void;
  on: (ev: string, cb: () => void) => D3Simulation;
  force: (name: string, f: unknown) => D3Simulation;
};

type D3Module = {
  select: (el: Element | HTMLElement) => D3Selection;
  drag: () => D3Drag;
  forceSimulation: (nodes: TopoNode[]) => D3Simulation;
  forceLink: (links: TopoLink[]) => { id: (fn: (d: TopoNode) => string) => { distance: (n: number) => unknown } };
  forceManyBody: () => { strength: (n: number) => unknown };
  forceCenter: (x: number, y: number) => unknown;
  arc?: (...args: unknown[]) => any;
  bin?: (...args: unknown[]) => any;
  scaleTime?: (...args: unknown[]) => any;
  scaleLinear?: (...args: unknown[]) => any;
  extent?: (...args: unknown[]) => any;
};

@Component({
  selector: 'app-topology',
  templateUrl: './topology.component.html',
  styleUrls: ['./topology.component.scss'],
})
export class TopologyComponent implements AfterViewInit, OnDestroy {
  @ViewChild('graph', { static: true }) graphEl!: ElementRef<HTMLDivElement>;

  private svg?: D3Selection | null;
  private simulation?: D3Simulation | null;
  private d3: D3Module | null = null;

  public loading = false;
  public lastError: string | null = null;

  constructor(private http: HttpClient) {}

  async ngAfterViewInit(): Promise<void> {
    await this.initSvg();
    this.loadTopology();
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    this.simulation?.stop();
    window.removeEventListener('resize', this.onResize);
  }

  private async initSvg() {
    const el = this.graphEl.nativeElement;
    const w = el.clientWidth || 800;
    const h = Math.max(360, el.clientHeight || 480);
    await this.loadD3();
    const d3 = this.d3 as D3Module;
    this.svg = d3
      .select(el)
      .append('svg')
      .attr('width', '100%')
      .attr('height', h)
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');
    this.svg.append('g').attr('class', 'links');
    this.svg.append('g').attr('class', 'nodes');
  }

  private async loadD3() {
    if (this.d3) return this.d3;
    if (_d3) {
      this.d3 = _d3;
      return this.d3;
    }
    try {
      // dynamic import keeps Jest from attempting to statically parse ESM d3
      const mod = await import('d3');
      _d3 = mod;
      this.d3 = mod;
      return this.d3;
    } catch (_err) {
      // fallback: provide a minimal stub so tests can run without d3
      const selection: D3Selection = {} as D3Selection;
      selection.append = (_tag: string) => selection;
      selection.attr = (_name: string, _value?: unknown) => selection;
      selection.select = (_sel?: string) => selection;
      selection.selectAll = (_sel: string) => selection;
      selection.data = (_d: unknown[]) => selection;
      selection.enter = () => selection;
      selection.call = (_fn: unknown) => selection;
      selection.text = (_t?: unknown) => selection;
      selection.remove = () => selection;

      const dragStub: D3Drag = { on: (_ev: string, _handler: (event: D3DragEvent, d: TopoNode) => void) => dragStub };

      const simStub: D3Simulation = {
        stop: () => {},
        alphaTarget: (_n: number) => simStub,
        restart: () => {},
        on: (_ev: string, _cb: () => void) => simStub,
        force: (_name: string, _f: unknown) => simStub,
      };

      this.d3 = {
        select: () => selection,
        drag: () => dragStub,
        forceSimulation: (_nodes: TopoNode[]) => simStub,
        forceLink: (_links: TopoLink[]) => ({ id: () => ({ distance: () => ({}) }) }),
        forceManyBody: () => ({ strength: () => ({}) }),
        forceCenter: (_x: number, _y: number) => ({}),
      };
      return this.d3;
    }
  }

  private render(nodes: TopoNode[], links: TopoLink[]) {
    if (!this.svg) return;
    this.svg!.selectAll('*').remove?.();
    const el = this.graphEl.nativeElement;
    const w = el.clientWidth || 800;
    const h = Math.max(360, el.clientHeight || 480);
    this.svg.attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);

    const linkGroup = this.svg.append('g').attr('class', 'links');
    const nodeGroup = this.svg.append('g').attr('class', 'nodes');

    const d3 = this.d3 as D3Module;
    const link = linkGroup
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#bdbdbd')
      .attr('stroke-width', (d: TopoLink) => (d.value ? Math.max(1, Math.log(d.value + 1)) : 1));

    const node = nodeGroup
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .call(d3.drag().on('start', (event: D3DragEvent, d: TopoNode) => this.dragstarted(event, d)).on('drag', (event: D3DragEvent, d: TopoNode) => this.dragged(event, d)).on('end', (event: D3DragEvent, d: TopoNode) => this.dragended(event, d)));

    node.append('circle').attr('r', 14).attr('fill', (d: TopoNode) => (d.group === 'infra' ? '#90caf9' : '#ffd54f')).attr('stroke', '#374151');
    node
      .append('text')
      .attr('x', 18)
      .attr('y', 4)
      .attr('font-size', 12)
      .text((d: TopoNode) => d.label ?? d.id);

    this.simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: TopoNode) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .on('tick', () => {
        link.attr('x1', (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          return s.x ?? 0;
        });
        link.attr('y1', (ln: TopoLink) => {
          const s = ln.source as TopoNode;
          return s.y ?? 0;
        });
        link.attr('x2', (ln: TopoLink) => {
          const t = ln.target as TopoNode;
          return t.x ?? 0;
        });
        link.attr('y2', (ln: TopoLink) => {
          const t = ln.target as TopoNode;
          return t.y ?? 0;
        });

        node.attr('transform', (nd: TopoNode) => `translate(${nd.x ?? 0},${nd.y ?? 0})`);
      });
    node.on?.('click', (_event: unknown, datum: unknown) => console.log('Topology node click', datum as TopoNode));
  }

  private dragstarted(event: D3DragEvent, d: TopoNode) {
    if (!this.simulation) return;
    if (!event.active) this.simulation.alphaTarget(0.3).restart?.();
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragged(event: D3DragEvent, d: TopoNode) {
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragended(event: D3DragEvent, d: TopoNode) {
    if (!this.simulation) return;
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  private onResize = () => {
    // re-render using last-known data (simple approach: reload)
    this.loadTopology();
  };

  public refresh() {
    this.loadTopology(true);
  }

  private loadTopology(forceApi = false) {
    this.loading = true;
    this.lastError = null;
    // try optional backend endpoint `/api/topology` if present; otherwise fall back to mock
    const api = '/api/topology';
    if (forceApi) {
      this.http.get<{ nodes: TopoNode[]; links: TopoLink[] }>(api).subscribe(
        (res) => {
          this.render(res.nodes ?? [], res.links ?? []);
          this.loading = false;
        },
        () => {
          this.render(this.mockNodes(), this.mockLinks());
          this.loading = false;
        },
      );
      return;
    }

    // first attempt to fetch; if fails, immediate fallback to mock
    this.http.get<{ nodes: TopoNode[]; links: TopoLink[] }>(api).subscribe(
      (res) => {
        this.render(res.nodes ?? [], res.links ?? []);
        this.loading = false;
      },
      () => {
        this.render(this.mockNodes(), this.mockLinks());
        this.loading = false;
      },
    );
  }

  private mockNodes(): TopoNode[] {
    return [
      { id: 'dg', label: 'Data Generator', group: 'app' },
      { id: 'kafka', label: 'Kafka', group: 'infra' },
      { id: 'backend', label: 'Nest SSR', group: 'app' },
      { id: 'frontend', label: 'Angular Frontend', group: 'app' },
      { id: 'minio', label: 'MinIO', group: 'infra' },
      { id: 'prom', label: 'Prometheus', group: 'infra' },
      { id: 'grafana', label: 'Grafana', group: 'infra' },
      { id: 'loki', label: 'Loki', group: 'infra' },
      { id: 'alertmanager', label: 'Alertmanager', group: 'infra' },
      { id: 'java-ingest', label: 'Java Ingest', group: 'app' },
      { id: 'nginx', label: 'NGINX (static)', group: 'infra' },
    ];
  }

  private mockLinks(): TopoLink[] {
    return [
      { source: 'dg', target: 'kafka' },
      { source: 'dg', target: 'minio' },
      { source: 'dg', target: 'prom' },
      { source: 'kafka', target: 'backend' },
      { source: 'backend', target: 'frontend' },
      { source: 'frontend', target: 'prom' },
      { source: 'prom', target: 'grafana' },
      { source: 'loki', target: 'grafana' },
      { source: 'prom', target: 'alertmanager' },
      { source: 'java-ingest', target: 'kafka' },
      { source: 'java-ingest', target: 'minio' },
      { source: 'frontend', target: 'nginx' },
    ];
  }
}

// Mock vite before importing server.nest
jest.mock('vite', () => ({ createServer: jest.fn() }));

// Mock @angular/ssr
jest.mock('@angular/ssr', () => ({ CommonEngine: jest.fn() }));

import { AppController } from '../../../../server.nest';

// Mock net.Socket behavior for TCP checks
jest.mock('net', () => {
  const EventEmitter = require('events');
  class FakeSocket extends EventEmitter {
    constructor() { super(); }
    setTimeout(_ms: number, _cb?: () => void) { /* no-op for mock */ }
    connect(_port: number, _host: string, cb?: () => void) { process.nextTick(() => { this['emit']('connect'); if (cb) cb(); }); }
    destroy() { /* no-op for mock */ }
    once(ev: string, cb: (...args: unknown[]) => void) { super.once(ev, cb); }
  }
  return { Socket: FakeSocket };
});

describe('AppController diagnostics endpoints', () => {
  it('returns docker services list with status, latency, and icons', async () => {
    const ctrl = new AppController({} as any, {} as any);

    // stub fetchWithTimeout to simulate HTTP readiness checks
    (ctrl as any).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });

    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await ctrl.getDockerServices(res);
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(5);
    // Check structure of returned services
    const prometheus = result.find((s: any) => s.name === 'Prometheus');
    expect(prometheus).toBeDefined();
    expect(prometheus).toHaveProperty('status');
    expect(prometheus).toHaveProperty('latencyMs');
    expect(prometheus).toHaveProperty('icon', 'monitoring');
    // Check Kafka (TCP service)
    const kafka = result.find((s: any) => s.name === 'Kafka');
    expect(kafka).toBeDefined();
    expect(kafka).toHaveProperty('icon', 'stream');
  });

  it('returns single service detail by name with latency', async () => {
    const ctrl = new AppController({} as any, {} as any);
    (ctrl as any).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });
    const req: any = { params: { name: 'Prometheus' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await ctrl.getDockerServiceByName(res, req);
    expect(res.json).toHaveBeenCalled();
    const obj = res.json.mock.calls[0][0];
    expect(obj).toHaveProperty('name', 'Prometheus');
    expect(obj).toHaveProperty('status');
    expect(obj).toHaveProperty('latencyMs');
    expect(obj).toHaveProperty('lastChecked');
  });

  it('returns 404 for unknown service name', async () => {
    const ctrl = new AppController({} as any, {} as any);
    const req: any = { params: { name: 'NonExistentService' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await ctrl.getDockerServiceByName(res, req);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'service_not_found', name: 'NonExistentService' });
  });

  it('handles TCP service check for Pulsar', async () => {
    const ctrl = new AppController({} as any, {} as any);
    (ctrl as any).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });
    const req: any = { params: { name: 'Pulsar' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await ctrl.getDockerServiceByName(res, req);
    expect(res.json).toHaveBeenCalled();
    const obj = res.json.mock.calls[0][0];
    expect(obj).toHaveProperty('name', 'Pulsar');
    expect(obj.status).toBe('online'); // Mock socket connects successfully
  });
});

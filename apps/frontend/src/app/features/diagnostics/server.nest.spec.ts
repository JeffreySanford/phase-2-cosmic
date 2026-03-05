// Mock vite before importing server.nest
jest.mock('vite', () => ({ createServer: jest.fn() }));

// Mock @angular/ssr
jest.mock('@angular/ssr', () => ({ CommonEngine: jest.fn() }));

import { AppController } from '../../../../server.nest';
import { Response, Request } from 'express';

// Mock net.Socket behavior for TCP checks
jest.mock('net', () => {
  const EventEmitter = require('events');
  class FakeSocket extends EventEmitter {
    constructor() { super(); }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setTimeout(_ms: number, _cb?: () => void) { /* no-op for mock */ }
     
    connect(_port: number, _host: string, cb?: () => void) { process.nextTick(() => { this['emit']('connect'); if (cb) cb(); }); }
    destroy() { /* no-op for mock */ }
    once(ev: string, cb: (...args: unknown[]) => void) { super.once(ev, cb); }
  }
  return { Socket: FakeSocket };
});

interface ServiceResult {
  name: string;
  status: string;
  latencyMs?: number;
  icon?: string;
}

function createMockResponse() {
  const res = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { json: jest.Mock; status: jest.Mock };
}

function createMockRequest(name: string) {
  return { params: { name } } as unknown as Request & { params: { name: string } };
}

describe('AppController diagnostics endpoints', () => {
  it('returns docker services list with status, latency, and icons', async () => {
    const ctrl = new AppController({} as ConstructorParameters<typeof AppController>[0], {} as ConstructorParameters<typeof AppController>[1]);

    // stub fetchWithTimeout to simulate HTTP readiness checks
    (ctrl as unknown as { fetchWithTimeout: jest.Mock }).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });

    const res = createMockResponse();
    await ctrl.getDockerServices(res);
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0] as ServiceResult[];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(5);
    // Check structure of returned services
    const prometheus = result.find((s: ServiceResult) => s.name === 'Prometheus');
    expect(prometheus).toBeDefined();
    expect(prometheus).toHaveProperty('status');
    expect(prometheus).toHaveProperty('latencyMs');
    expect(prometheus).toHaveProperty('icon', 'monitoring');
    // Check Kafka (TCP service)
    const kafka = result.find((s: ServiceResult) => s.name === 'Kafka');
    expect(kafka).toBeDefined();
    expect(kafka).toHaveProperty('icon', 'stream');
  });

  it('returns single service detail by name with latency', async () => {
    const ctrl = new AppController({} as ConstructorParameters<typeof AppController>[0], {} as ConstructorParameters<typeof AppController>[1]);
    (ctrl as unknown as { fetchWithTimeout: jest.Mock }).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });
    const req = createMockRequest('Prometheus');
    const res = createMockResponse();
    await ctrl.getDockerServiceByName(res, req);
    expect(res.json).toHaveBeenCalled();
    const obj = res.json.mock.calls[0][0];
    expect(obj).toHaveProperty('name', 'Prometheus');
    expect(obj).toHaveProperty('status');
    expect(obj).toHaveProperty('latencyMs');
    expect(obj).toHaveProperty('lastChecked');
  });

  it('returns 404 for unknown service name', async () => {
    const ctrl = new AppController({} as ConstructorParameters<typeof AppController>[0], {} as ConstructorParameters<typeof AppController>[1]);
    const req = createMockRequest('NonExistentService');
    const res = createMockResponse();
    await ctrl.getDockerServiceByName(res, req);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'service_not_found', name: 'NonExistentService' });
  });

  it('handles TCP service check for Pulsar', async () => {
    const ctrl = new AppController({} as ConstructorParameters<typeof AppController>[0], {} as ConstructorParameters<typeof AppController>[1]);
    (ctrl as unknown as { fetchWithTimeout: jest.Mock }).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });
    const req = createMockRequest('Pulsar');
    const res = createMockResponse();
    await ctrl.getDockerServiceByName(res, req);
    expect(res.json).toHaveBeenCalled();
    const obj = res.json.mock.calls[0][0];
    expect(obj).toHaveProperty('name', 'Pulsar');
    expect(obj.status).toBe('healthy'); // Mock socket connects successfully
  });
});

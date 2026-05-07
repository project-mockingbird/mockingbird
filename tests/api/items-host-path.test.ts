import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyInstance } from 'fastify';

// Mock the host-path translator BEFORE the route module is imported. The
// route module imports `toHostPath` and calls it for every emitted filePath;
// we want to verify wiring at the route boundary, not the translator's own
// /proc/self/mountinfo discovery (which is exercised by host-path.test.ts).
vi.mock('../../src/api/host-path.js', () => ({
  toHostPath: (containerPath: string) =>
    containerPath ? `HOSTIFIED::${containerPath}` : containerPath,
}));

const { createServer } = await import('../../src/api/server.js');

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('Items API - host path translation wiring', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES });
    app = result.app;
    await result.engine.readiness.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/items/:id returns a translated filePath', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { filePath: string };
    expect(body.filePath.startsWith('HOSTIFIED::')).toBe(true);
    expect(body.filePath).toMatch(/\.yml$/);
  });

  it('GET /api/items/:id/yaml returns a translated filePath alongside yaml', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/yaml',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { yaml: string; filePath: string };
    expect(typeof body.yaml).toBe('string');
    expect(body.filePath.startsWith('HOSTIFIED::')).toBe(true);
  });
});

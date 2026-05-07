import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('GET /api/modules', () => {
  let app: FastifyInstance;
  beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
  afterAll(async () => { await app.close(); });

  it('returns discovered modules', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/modules' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('namespace');
  });
});

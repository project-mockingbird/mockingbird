import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('POST /api/validate', () => {
  let app: FastifyInstance;
  beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
  afterAll(async () => { await app.close(); });

  it('returns validation result', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/validate' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('valid');
    expect(body).toHaveProperty('errors');
    expect(body.valid).toBe(true);
  });
});

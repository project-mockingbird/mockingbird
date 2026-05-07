import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../src/api/server.js';

describe('CORS allowlist', () => {
  let app: FastifyInstance;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-cors-'));
    delete process.env.MOCKINGBIRD_ALLOWED_ORIGINS;
  });

  afterEach(async () => {
    if (app) await app.close();
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.MOCKINGBIRD_ALLOWED_ORIGINS;
  });

  it('allows requests with no Origin header (same-origin browser fetch / curl)', async () => {
    ({ app } = await createServer({ rootDir: tempDir }));
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    // status route is exempt from the readiness gate so we get a real response,
    // not a 503. CORS rejection would surface as 500/missing CORS header rather
    // than the 200 we expect.
    expect(res.statusCode).toBe(200);
  });

  it('rejects a cross-origin preflight when no allowlist is configured', async () => {
    ({ app } = await createServer({ rootDir: tempDir }));
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/status',
      headers: {
        origin: 'http://evil.example.com',
        'access-control-request-method': 'GET',
      },
    });
    // @fastify/cors with origin returning false short-circuits without an
    // Access-Control-Allow-Origin header. Browsers refuse the request.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('honors MOCKINGBIRD_ALLOWED_ORIGINS for explicit allowlisted origins', async () => {
    process.env.MOCKINGBIRD_ALLOWED_ORIGINS = 'http://app.local,http://other.local';
    ({ app } = await createServer({ rootDir: tempDir }));
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/status',
      headers: {
        origin: 'http://app.local',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://app.local');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerGraphqlCapture, GRAPHQL_CAPTURE_PATHS } from '../../../src/api/logging/graphql-capture.js';
import { graphqlLogBuffer } from '../../../src/api/logging/buffers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await registerGraphqlCapture(app);
  for (const p of GRAPHQL_CAPTURE_PATHS) {
    app.post(p, async (req, reply) => {
      const body = req.body as { query?: string };
      if (body?.query?.includes('FAIL_HTTP')) return reply.code(500).send({ error: 'oops' });
      if (body?.query?.includes('GQL_ERR')) return reply.send({ data: null, errors: [{ message: 'bad' }] });
      return reply.send({ data: { ok: true } });
    });
  }
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function lastN(n: number) {
  const all = graphqlLogBuffer.getSince(0);
  return all.slice(-n);
}

describe('graphql-capture', () => {
  it('captures query, operationName, variables, status, duration, response body', async () => {
    const before = graphqlLogBuffer.getSince(0).length;
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: 'query GetX($id: ID!) { x }', operationName: 'GetX', variables: { id: '1' } },
    });
    expect(res.statusCode).toBe(200);
    const added = graphqlLogBuffer.getSince(0).length - before;
    expect(added).toBe(1);
    const entry = lastN(1)[0];
    expect(entry.operationName).toBe('GetX');
    expect(entry.operationType).toBe('query');
    expect(entry.statusCode).toBe(200);
    expect(entry.request?.query).toBe('query GetX($id: ID!) { x }');
    expect(entry.request?.variables).toEqual({ id: '1' });
    expect(entry.response?.body).toContain('"ok":true');
    expect(entry.errorCount).toBe(0);
    expect(typeof entry.durationMs).toBe('number');
    expect(entry.requestId.length).toBeGreaterThan(0);
  });

  it('detects mutation operationType', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: 'mutation DoX { y }' },
    });
    const entry = lastN(1)[0];
    expect(entry.operationType).toBe('mutation');
    expect(entry.operationName).toBe(null);
  });

  it('truncates oversize bodies and flags truncated', async () => {
    const big = 'a'.repeat(200_000);
    await app.inject({
      method: 'POST',
      url: '/api/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: `query Big { ${big} }` },
    });
    const entry = lastN(1)[0];
    expect(entry.request?.truncated).toBe(true);
    expect(entry.request?.query.length).toBeLessThanOrEqual(65_536);
  });

  it('replaces oversize variables with a truncation marker and flags truncated', async () => {
    const fat = 'b'.repeat(200_000);
    await app.inject({
      method: 'POST',
      url: '/api/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: 'query Q { x }', variables: { fat } },
    });
    const entry = lastN(1)[0];
    expect(entry.request?.truncated).toBe(true);
    const vars = entry.request?.variables as { __mockingbirdTruncated?: boolean; originalSize?: number };
    expect(vars?.__mockingbirdTruncated).toBe(true);
    expect(vars?.originalSize).toBeGreaterThan(65_536);
  });

  it('also hooks /sitecore/api/graph/edge', async () => {
    const before = graphqlLogBuffer.getSince(0).length;
    await app.inject({
      method: 'POST',
      url: '/sitecore/api/graph/edge',
      headers: { 'content-type': 'application/json' },
      payload: { query: 'query A { a }' },
    });
    expect(graphqlLogBuffer.getSince(0).length - before).toBe(1);
  });

  it('still captures on HTTP error response', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: 'query FAIL_HTTP { x }' },
    });
    const entry = lastN(1)[0];
    expect(entry.statusCode).toBe(500);
  });

  it('extracts error count + first error from 200-with-errors response', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: 'query GQL_ERR { x }' },
    });
    const entry = lastN(1)[0];
    expect(entry.errorCount).toBe(1);
    expect(entry.firstError).toBe('bad');
  });

  it('captureError set when request body is non-JSON', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/graphql',
      headers: { 'content-type': 'text/plain' },
      payload: 'not json',
    });
    const entry = lastN(1)[0];
    expect(entry.captureError).toBeTruthy();
  });
});

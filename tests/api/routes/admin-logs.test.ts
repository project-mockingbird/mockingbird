import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAdminLogsRoutes } from '../../../src/api/routes/admin-logs.js';
import { serverLogBuffer, graphqlLogBuffer } from '../../../src/api/logging/buffers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await registerAdminLogsRoutes(app);
  await app.ready();
});

afterEach(async () => { await app.close(); });

function parseSseChunk(body: string) {
  const events: { event: string; data: string }[] = [];
  for (const block of body.split('\n\n')) {
    if (!block.trim()) continue;
    const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? 'message';
    const data = /^data:\s*(.+)$/m.exec(block)?.[1] ?? '';
    events.push({ event, data });
  }
  return events;
}

describe('GET /api/admin/logs/server/stream', () => {
  it('emits a replay event with the buffered tail on connect', async () => {
    serverLogBuffer.push({ ts: 1, level: 'info', msg: 'hello', raw: '{}' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/logs/server/stream',
      headers: { accept: 'text/event-stream' },
      payloadAsStream: true,
    });
    // Read the first SSE block (the replay event), then close.
    let chunk = '';
    for await (const piece of res.stream()) {
      chunk += piece.toString('utf8');
      if (chunk.includes('\n\n')) break;
    }
    res.stream().destroy();
    const events = parseSseChunk(chunk);
    expect(events[0].event).toBe('replay');
    const data = JSON.parse(events[0].data);
    expect(Array.isArray(data)).toBe(true);
    expect(data.find((e: { msg: string }) => e.msg === 'hello')).toBeTruthy();
  });

  it('honors Last-Event-ID by replaying only newer entries', async () => {
    const a = serverLogBuffer.push({ ts: 1, level: 'info', msg: 'a', raw: '{}' });
    serverLogBuffer.push({ ts: 2, level: 'info', msg: 'b', raw: '{}' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/logs/server/stream',
      headers: { accept: 'text/event-stream', 'last-event-id': String(a.id) },
      payloadAsStream: true,
    });
    let chunk = '';
    for await (const piece of res.stream()) {
      chunk += piece.toString('utf8');
      if (chunk.includes('\n\n')) break;
    }
    res.stream().destroy();
    const events = parseSseChunk(chunk);
    const data = JSON.parse(events[0].data);
    expect(data.find((e: { msg: string }) => e.msg === 'a')).toBeFalsy();
    expect(data.find((e: { msg: string }) => e.msg === 'b')).toBeTruthy();
  });

  it('serves the graphql stream too', async () => {
    graphqlLogBuffer.push({
      ts: 1, requestId: 'r1', operationName: 'Q', operationType: 'query',
      statusCode: 200, durationMs: 5,
      request: { query: 'query Q { x }', variables: null, truncated: false },
      response: { body: '{}', truncated: false },
      errorCount: 0, firstError: null,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/logs/graphql/stream',
      headers: { accept: 'text/event-stream' },
      payloadAsStream: true,
    });
    let chunk = '';
    for await (const piece of res.stream()) {
      chunk += piece.toString('utf8');
      if (chunk.includes('\n\n')) break;
    }
    res.stream().destroy();
    const events = parseSseChunk(chunk);
    expect(events[0].event).toBe('replay');
    const data = JSON.parse(events[0].data);
    expect(data.find((e: { operationName: string }) => e.operationName === 'Q')).toBeTruthy();
  });
});

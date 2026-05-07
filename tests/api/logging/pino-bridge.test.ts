import { describe, it, expect } from 'vitest';
import { createPinoBridge, type ServerLogEntry } from '../../../src/api/logging/pino-bridge.js';
import { RingBuffer } from '../../../src/api/logging/ring-buffer.js';

function feed(stream: NodeJS.WritableStream, line: object): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(JSON.stringify(line) + '\n', (err) => err ? reject(err) : resolve());
  });
}

describe('createPinoBridge', () => {
  it('parses pino request-completed lines and pushes normalized entry', async () => {
    const buf = new RingBuffer<ServerLogEntry>(10);
    const stream = createPinoBridge(buf);

    await feed(stream, {
      level: 30,
      time: 1714867200123,
      msg: 'request completed',
      reqId: 'req-1',
      req: { method: 'POST', url: '/api/graphql' },
      res: { statusCode: 200 },
      responseTime: 45,
    });

    const all = buf.getSince(0);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      level: 'info',
      msg: 'request completed',
      method: 'POST',
      url: '/api/graphql',
      statusCode: 200,
      durationMs: 45,
      requestId: 'req-1',
    });
    expect(typeof all[0].raw).toBe('string');
    expect(all[0].ts).toBe(1714867200123);
  });

  it('parses warn / error level numbers correctly', async () => {
    const buf = new RingBuffer<ServerLogEntry>(10);
    const stream = createPinoBridge(buf);
    await feed(stream, { level: 40, time: 1, msg: 'warn-line' });
    await feed(stream, { level: 50, time: 2, msg: 'err-line' });
    const all = buf.getSince(0);
    expect(all.map(e => e.level)).toEqual(['warn', 'error']);
  });

  it('drops malformed lines and increments dropped counter', async () => {
    const buf = new RingBuffer<ServerLogEntry>(10);
    const stream = createPinoBridge(buf);
    await new Promise<void>((resolve, reject) =>
      stream.write('not-json\n', (err) => err ? reject(err) : resolve())
    );
    expect(buf.getSince(0)).toHaveLength(0);
    expect(buf.dropped).toBe(1);
  });

  it('handles multi-line buffered writes', async () => {
    const buf = new RingBuffer<ServerLogEntry>(10);
    const stream = createPinoBridge(buf);
    const block =
      JSON.stringify({ level: 30, time: 1, msg: 'a' }) + '\n' +
      JSON.stringify({ level: 30, time: 2, msg: 'b' }) + '\n';
    await new Promise<void>((resolve, reject) =>
      stream.write(block, (err) => err ? reject(err) : resolve())
    );
    expect(buf.getSince(0).map(e => e.msg)).toEqual(['a', 'b']);
  });

  it('reassembles a JSON object split across two writes', async () => {
    const buf = new RingBuffer<ServerLogEntry>(10);
    const stream = createPinoBridge(buf);
    const full = JSON.stringify({ level: 30, time: 1, msg: 'split' }) + '\n';
    const mid = Math.floor(full.length / 2);
    await new Promise<void>((resolve, reject) =>
      stream.write(full.slice(0, mid), (err) => err ? reject(err) : resolve())
    );
    expect(buf.getSince(0)).toHaveLength(0);
    await new Promise<void>((resolve, reject) =>
      stream.write(full.slice(mid), (err) => err ? reject(err) : resolve())
    );
    expect(buf.getSince(0).map(e => e.msg)).toEqual(['split']);
  });
});

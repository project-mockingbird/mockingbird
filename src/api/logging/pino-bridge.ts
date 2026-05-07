import { Writable } from 'node:stream';
import type { RingBuffer } from './ring-buffer.js';

export interface ServerLogEntry {
  id: number;
  ts: number;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  msg: string;
  method?: string;
  url?: string;
  statusCode?: number;
  durationMs?: number;
  requestId?: string;
  raw: string;
}

const LEVEL_MAP: Record<number, ServerLogEntry['level']> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

interface PinoLine {
  level?: number;
  time?: number;
  msg?: string;
  reqId?: string;
  req?: { method?: string; url?: string };
  res?: { statusCode?: number };
  responseTime?: number;
}

function normalize(raw: string, line: PinoLine): Omit<ServerLogEntry, 'id'> {
  return {
    ts: typeof line.time === 'number' ? line.time : Date.now(),
    level: LEVEL_MAP[line.level ?? 30] ?? 'info',
    msg: line.msg ?? '',
    method: line.req?.method,
    url: line.req?.url,
    statusCode: line.res?.statusCode,
    durationMs: typeof line.responseTime === 'number' ? line.responseTime : undefined,
    requestId: line.reqId,
    raw,
  };
}

/**
 * Build a Writable that the pino multistream config can target. Each
 * NDJSON line written is parsed once and pushed to `buf`. Malformed
 * lines increment `buf.dropped` rather than throw - logging must not
 * crash the server.
 */
export function createPinoBridge(buf: RingBuffer<ServerLogEntry>): Writable {
  let pending = '';
  return new Writable({
    write(chunk, _enc, cb) {
      pending += chunk.toString('utf8');
      let nl = pending.indexOf('\n');
      while (nl !== -1) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        if (line.length > 0) {
          try {
            const parsed = JSON.parse(line) as PinoLine;
            buf.push(normalize(line, parsed));
          } catch {
            buf.recordDrop();
          }
        }
        nl = pending.indexOf('\n');
      }
      cb();
    },
  });
}

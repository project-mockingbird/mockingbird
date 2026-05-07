import type { FastifyInstance, FastifyReply } from 'fastify';
import type { RingBuffer, RingEntry } from '../logging/ring-buffer.js';
import { serverLogBuffer, graphqlLogBuffer } from '../logging/buffers.js';

const HEARTBEAT_MS = 25_000;

function writeSse(reply: FastifyReply, event: string, data: string, id?: number): void {
  const lines: string[] = [`event: ${event}`];
  if (id !== undefined) lines.push(`id: ${id}`);
  // SSE data lines must each be `data:` prefixed; the data we send is
  // single-line JSON so a single prefix is enough.
  lines.push(`data: ${data}`);
  lines.push('', '');
  reply.raw.write(lines.join('\n'));
}

function streamBuffer<T extends RingEntry>(buf: RingBuffer<T>, reply: FastifyReply, sinceId: number): void {
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  // Replay-then-subscribe MUST stay synchronous: any await between
  // getSince() and subscribe() opens a drop window where a push lands
  // in neither the replay payload nor the live entry stream.
  const replay = buf.getSince(sinceId);
  const lastId = replay.length > 0 ? replay[replay.length - 1].id : sinceId;
  writeSse(reply, 'replay', JSON.stringify(replay), lastId);

  const unsub = buf.subscribe((entry) => {
    writeSse(reply, 'entry', JSON.stringify(entry), entry.id);
  });

  let heartbeat: NodeJS.Timeout | null = null;
  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    unsub();
  };
  // Wire close/error listeners BEFORE starting the heartbeat so a
  // synchronous socket-error path can't leave the interval orphaned
  // on a dead socket. The catch in the heartbeat write is best-effort
  // for synchronous throws; the actual half-dead-socket safeguard is
  // the 'error' listener firing cleanup.
  reply.raw.on('close', cleanup);
  reply.raw.on('error', cleanup);
  heartbeat = setInterval(() => {
    try { reply.raw.write(`event: heartbeat\ndata: 0\n\n`); } catch { /* socket gone */ }
  }, HEARTBEAT_MS);
}

function parseLastEventId(header: string | string[] | undefined): number {
  if (!header) return 0;
  const v = Array.isArray(header) ? header[0] : header;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function registerAdminLogsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/logs/server/stream', (req, reply) => {
    streamBuffer(serverLogBuffer, reply, parseLastEventId(req.headers['last-event-id']));
  });
  app.get('/api/admin/logs/graphql/stream', (req, reply) => {
    streamBuffer(graphqlLogBuffer, reply, parseLastEventId(req.headers['last-event-id']));
  });
}

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { Engine } from '../engine/index.js';
import type { ItemChangeEvent } from '../engine/types.js';

const clients = new Set<WebSocket>();

/**
 * Decide whether a WebSocket upgrade is allowed given the request's Origin
 * header. The default policy is same-origin: Origin's host must match the
 * request's Host header. A missing/null Origin is allowed - browsers always
 * send Origin on WS upgrades, so its absence indicates a non-browser client
 * (curl, the CLI, a Node.js test harness). MOCKINGBIRD_WS_ALLOWED_ORIGINS
 * is a comma-separated allowlist of full origins (scheme://host[:port])
 * that override the same-origin default.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowlist: readonly string[],
): boolean {
  if (!origin) return true;
  if (allowlist.includes(origin)) return true;
  if (!host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === host;
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function registerWebSocket(app: FastifyInstance, _engine: Engine): void {
  const allowlist = parseAllowlist(process.env.MOCKINGBIRD_WS_ALLOWED_ORIGINS);

  app.get('/ws', { websocket: true }, (socket, request: FastifyRequest) => {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (!isOriginAllowed(origin, host, allowlist)) {
      // 1008 = policy violation. Close before adding to clients so we don't
      // broadcast item-change events to a rejected client.
      socket.close(1008, 'origin not allowed');
      return;
    }
    clients.add(socket);
    socket.on('close', () => {
      clients.delete(socket);
    });
  });
}

export function broadcastItemChange(event: ItemChangeEvent): void {
  // 'moved' carries an extra fromPath so subscribers can refresh both the
  // old and new parent's children lists in one round-trip. Other event
  // types omit it to keep the wire format minimal.
  const payload: Record<string, unknown> = {
    type: `item:${event.type}`,
    id: event.itemId,
    path: event.itemPath,
  };
  if (event.type === 'moved') {
    payload.fromPath = event.fromPath ?? '';
  }
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

export function broadcastValidation(engine: Engine): void {
  const result = engine.validate();
  const message = JSON.stringify({
    type: 'validation:updated',
    valid: result.valid,
    errorCount: result.errors.filter(e => e.severity === 'error').length,
  });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}
